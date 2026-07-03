import express, { type ErrorRequestHandler } from "express";
import z from "zod";
import jwt from "jsonwebtoken";
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { UserModel } from "./dbSchema.js";
import logger from "./logger.js";
import { pinoHttp } from "pino-http";

const saltRounds = 12;
const app = express();

const signupSchema = z.strictObject({
	name: z.string().min(3),
	email: z.email(),
	password: z.string().min(8),
});
const signinSchema = z.strictObject({
	email: z.email(),
	password: z.string().min(8),
});

app.use(
	pinoHttp({
		logger,
		serializers: {
			req(req) {
				return {
					id: req.id,
					method: req.method,
					url: req.url,
				};
			},
			res(res) {
				return {
					statusCode: res.statusCode,
				};
			},
		},
	}),
);
app.use(express.json());

app.post("/api/v1/signup", async (req, res, next) => {
	try {
		const parsedBody = signupSchema.safeParse(req.body);
		if (!parsedBody.success) {
			req.log.warn(
				{ validationErrors: z.prettifyError(parsedBody.error) },
				"Request validation failed",
			);
			return res.status(422).json({
				message: "Validation failed. Try again with correct schema.",
			});
		}
		const parsedName = parsedBody.data.name;
		const parsedEmail = parsedBody.data.email;
		const hashedPassword: string = await bcrypt.hash(
			parsedBody.data.password,
			saltRounds,
		);
		const createdUser = await UserModel.create({
			name: parsedName,
			email: parsedEmail,
			password: hashedPassword,
		});
		req.log.info({ email: parsedEmail }, "User created successfully");
		return res.status(201).json({
			message: "Signup successful.",
			name: createdUser.name,
			email: createdUser.email,
		});
	} catch (err: any) {
		if (err.code === 11000) {
			req.log.warn("Duplicate signup attempt");
			return res.status(409).json({
				message: "Email already exists.",
			});
		} else {
			return next(err);
		}
	}
});

app.post("/api/v1/signin", async (req, res, next) => {
	try {
		const parsedBody = signinSchema.safeParse(req.body);
		if (!parsedBody.success) {
			req.log.warn(
				{ validationErrors: z.prettifyError(parsedBody.error) },
				"Request validation failed",
			);
			return res.status(422).json({
				message: "Validation failed. Try again with correct schema.",
			});
		}
		const user = await UserModel.findOne({ email: parsedBody.data.email });
		if (!user) {
			req.log.warn(
				{ email: parsedBody.data.email },
				"Signin failed: user not found",
			);
			return res.status(401).json({
				message: "Email / password invalid",
			});
		}
		const isPasswordMatch = await bcrypt.compare(
			parsedBody.data.password,
			user.password,
		);
		if (!isPasswordMatch) {
			req.log.warn(
				{ email: parsedBody.data.email },
				"Signin failed: invalid password",
			);
			return res.status(401).json({
				message: "Email / password invalid",
			});
		}
		const jwtPrivateKey: string | undefined =
			process.env["JWT_PRIVATE_KEY"];
		if (!jwtPrivateKey) {
			req.log.error("JWT private key not found.");
			return res.status(500).json({
				message: "Internal server error. Try again later.",
			});
		}
		const token: string = jwt.sign(
			{
				userId: user._id.toString(),
			},
			jwtPrivateKey,
		);
		req.log.info({ userId: user._id }, "User signed in");
		return res
			.status(200)
			.json({ message: "Signin successful.", token: token });
	} catch (err) {
		return next(err);
	}
});

const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
	req.log.error(err, "Error detected");
	return res
		.status(500)
		.json({ message: "Internal server error. Try again later." });
};

app.use(errorHandler);

const startServer: () => Promise<void> = async () => {
	const PORT = process.env["PORT"] || 3000;
	const mongoUrl = process.env["MONGO_URL"];
	try {
		if (!mongoUrl) {
			logger.error("Mongo URL not found.");
			throw new Error("Mongo URL not found.");
		}
		await mongoose.connect(mongoUrl);
		logger.info("Connected to MongoDB successfully.");
		app.listen(PORT);
		logger.info(`Server running on port ${PORT}`);
	} catch (err) {
		logger.error({ error: err }, "Initialisation failed.");
		process.exit(1);
	}
};

startServer();
