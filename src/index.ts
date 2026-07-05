import express, {
	type ErrorRequestHandler,
	type NextFunction,
	type Request,
	type Response,
} from "express";
import z from "zod";
import jwt from "jsonwebtoken";
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { UserModel, ContentModel, TagModel, LinkModel } from "./dbSchema.js";
import logger from "./logger.js";
import { pinoHttp } from "pino-http";
import { decodeJwtMiddleware } from "./middleware/jwtDecode.js";
import { getFormattedData } from "./helper/formatData.js";

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
const contentSchema = z.strictObject({
	title: z.string().min(3).max(50),
	content: z.string().min(5).max(5000),
	tags: z.array(z.string()).optional(),
});
const shareSchema = z.strictObject({
	share: z.boolean(),
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
		const user = await UserModel.findOne({
			email: parsedBody.data.email,
		}).select("+password");
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

app.post(
	"/api/v1/content",
	decodeJwtMiddleware,
	async (req: Request, res: Response, next: NextFunction) => {
		const userId = res.locals["userId"];
		const parsedBody = contentSchema.safeParse(req.body);
		if (!parsedBody.success) {
			req.log.warn("Invalid content schema");
			return res.status(422).json({
				message: "Malformed request body",
			});
		}
		try {
			const { title, content, tags = [] } = parsedBody.data;
			const tagDocs = await Promise.all(
				tags.map((tagName) => {
					return TagModel.findOneAndUpdate(
						{ user: userId, name: tagName.toLowerCase().trim() },
						{
							$setOnInsert: {
								user: userId,
								name: tagName.toLowerCase().trim(),
							},
						},
						{
							upsert: true,
							returnDocument: "after",
						},
					);
				}),
			);
			const tagIds = tagDocs.map((tag) => tag._id);
			await ContentModel.create({
				title,
				content,
				tags: tagIds,
				user: userId,
			});
			req.log.info("New content created.");
			return res.status(201).json({ message: "Content created." });
		} catch (err) {
			return next(err);
		}
	},
);

app.get("/api/v1/content", decodeJwtMiddleware, async (req, res, next) => {
	const userId = res.locals["userId"];
	const tagName = req.query["tag"] as string | undefined;
	try {
		const data = await getFormattedData(userId, tagName);
		if (!data.length) {
			req.log.warn(
				{ userId },
				"Empty data returned or user might not exist.",
			);
		}
		return res.status(200).json({
			message: data.length ? "Content found" : "No content found",
			data,
		});
	} catch (err) {
		return next(err);
	}
});

app.get("/api/v1/tags", decodeJwtMiddleware, async (req, res, next) => {
	const userId = res.locals["userId"];
	try {
		const tags = await TagModel.find({ user: userId })
			.select("name -_id")
			.sort({ name: 1 });
		let formattedTags: string[] = [];
		if (tags) {
			formattedTags = tags.map((item) => item.name);
		}
		req.log.info("Tags fetched.");
		return res.status(200).json({
			message: tags.length ? "Tags found" : "No tags found",
			data: formattedTags,
		});
	} catch (err) {
		return next(err);
	}
});

app.delete("/api/v1/delete", decodeJwtMiddleware, async (req, res, next) => {
	const userId = res.locals["userId"];
	try {
		const data = await ContentModel.deleteMany({ user: userId });
		req.log.info({ userId }, "Content deleted");
		return res.status(200).json({ message: "Content deleted.", data });
	} catch (err) {
		return next(err);
	}
});

app.post("/api/v1/brain/share", decodeJwtMiddleware, async (req, res, next) => {
	const parsedBody = shareSchema.safeParse(req.body);
	const userId = res.locals["userId"];
	if (!parsedBody.success) {
		req.log.warn("Invalid content schema");
		return res.status(422).json({
			message: "Malformed request body",
		});
	}
	try {
		if (parsedBody.data.share) {
			const linkData = await LinkModel.create({
				hash: crypto.randomUUID(),
				userId,
			});
			req.log.info("Link generated.");
			return res.status(200).json({
				message: "Link generated.",
				link: linkData.hash,
			});
		} else {
			const deletedLinkData = await LinkModel.deleteOne({
				userId: userId,
			});
			if (deletedLinkData.deletedCount === 0) {
				req.log.warn("User tried deleting a non existent link");
				return res.status(404).json({
					message: "No link found for given user.",
				});
			} else {
				req.log.info("Link deleted");
				return res.status(200).json({
					message: "Link deleted",
				});
			}
		}
	} catch (err: any) {
		if (err.code === 11000) {
			req.log.warn("Duplicate link attempt");
			return res.status(409).json({
				message: "Link already exists.",
			});
		} else {
			return next(err);
		}
	}
});

app.get("/api/v1/brain/:shareLink", async (req, res, next) => {
	try {
		const linkData = await LinkModel.findOne({
			hash: req.params.shareLink,
		});
		if (!linkData) {
			req.log.warn("Tried searching for non existent link");
			return res.status(404).json({
				message: "No matching link found",
			});
		}
		const userId = linkData.userId.toString();
		const data = await getFormattedData(userId);
		if (!data.length) {
			req.log.warn(
				{ userId },
				"Empty data returned with shareable link.",
			);
		}
		return res.status(200).json({
			message: data.length ? "Content found" : "No content found",
			data,
		});
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
