import express from "express";
import z from "zod";
import jwt from "jsonwebtoken";
import "dotenv/config";

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

app.post("/signup", async (req, res, next) => {
	try {
		const parsedBody = signupSchema.safeParse(req.body);
		if (parsedBody.success) {
			return res.status(200).json({ message: "Signup succesful." });
		} else if (!parsedBody.success) {
			console.log(z.prettifyError(parsedBody.error));
			return res.status(422).json({
				message: "Validation failed. Try again with correct schema.",
			});
		}
	} catch (err) {
		next(err);
	}
});

app.post("/api/v1/signin", (req, res, next) => {
	try {
		const parsedBody = signinSchema.safeParse(req.body);
		if (parsedBody.success) {
			const jwtPrivateKey: string = process.env.JWT_PRIVATE_KEY;
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
		next(err);
	}
});

app.use((err, req, res, next) => {
	console.log(`Error detected --> ${err}`);
	return res
		.status(500)
		.json({ message: "Internal server error. Try again later." });
});

app.listen(process.env.PORT);
console.log("Server running.");
