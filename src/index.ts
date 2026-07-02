import express, { type ErrorRequestHandler } from "express";
import z from "zod";
import jwt from "jsonwebtoken";
import "dotenv/config";
import mongoose from "mongoose";
import { UserModel } from "./dbSchema.js";

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

app.use(express.json());

app.post("/api/v1/signup", async (req, res, next) => {
	try {
		const parsedBody = signupSchema.safeParse(req.body);

		if (!parsedBody.success) {
			console.log(z.prettifyError(parsedBody.error));
			return res.status(422).json({
				message: "Validation failed. Try again with correct schema.",
			});
		}

		const createdUser = await UserModel.create(parsedBody.data);
		console.log("User created in database.");
		return res.status(200).json({
			message: "Signup succesful.",
			name: createdUser.name,
			email: createdUser.email,
		});
	} catch (err: any) {
		if (err.code === 11000) {
			return res.status(409).json({
				message: "Email already exists.",
			});
		} else {
			return next(err);
		}
	}
});

app.post("/api/v1/signin", (req, res, next) => {
	try {
		const parsedBody = signinSchema.safeParse(req.body);
		if (parsedBody.success) {
			const jwtPrivateKey: string | undefined =
				process.env["JWT_PRIVATE_KEY"];
			if (jwtPrivateKey) {
				const token: string = jwt.sign(
					{
						email: parsedBody.data.email,
					},
					jwtPrivateKey,
				);
				return res
					.status(200)
					.json({ message: "Signin succesful.", token: token });
			} else {
				console.log("Jwt private key not found.");
				return res.status(500).json({
					message: "Internal server error. Try again later.",
				});
			}
		} else if (!parsedBody.success) {
			console.log(z.prettifyError(parsedBody.error));
			return res.status(422).json({
				message: "Validation failed. Try again with correct schema.",
			});
		}
	} catch (err) {
		return next(err);
	}
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
	console.log(`Error detected --> ${err}`);
	return res
		.status(500)
		.json({ message: "Internal server error. Try again later." });
};

app.use(errorHandler);

const PORT = process.env["PORT"] || 3000;
const mongoUrl = process.env["MONGO_URL"];
if (!mongoUrl) {
	throw new Error("Mongo URL not found.");
}
mongoose
	.connect(mongoUrl)
	.then(() => {
		console.log("Connected to mongodb successfully.");
		app.listen(PORT, () => {
			console.log("Server running.");
		});
	})
	.catch((err) => {
		console.log("Failed to connect to mongodb. Error: ", err);
	});
