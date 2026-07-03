import { type NextFunction, type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import z from "zod";

// valid header -> authorization: Bearer JWT_TOKEN (not doing strict object so that other headers are allowed.)
const headerSchema = z.object({
	authorization: z.string().regex(/^Bearer\s.+$/),
});

// to verify that decodedJWT has userId. Not using strict object because JWT has other fields too like iat...
const jwtSchema = z.object({
	userId: z.string(),
});

// intercepts requests and attaches userId to res after successful verification.
export const decodeJwtMiddleware = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const parsedHeader = headerSchema.safeParse(req.headers);
	if (!parsedHeader.success) {
		return res.status(401).json({
			message: "Missing or malformed Authorization header",
		});
	}
	const token = parsedHeader.data.authorization.split(" ")[1]!;
	const jwtPrivateKey = process.env["JWT_PRIVATE_KEY"];
	if (!jwtPrivateKey) {
		return res.status(500).json({
			message: "Internal server error. Try again later.",
		});
	}
	try {
		const decodedJwt: string | jwt.JwtPayload = jwt.verify(
			token,
			jwtPrivateKey,
		);
		const parsedDecodedJwt = jwtSchema.safeParse(decodedJwt);
		if (!parsedDecodedJwt.success) {
			return res.status(401).json({
				message: "Invalid content in token.",
			});
		}
		const userId = parsedDecodedJwt.data.userId;
		res.locals["userId"] = userId;
		return next();
	} catch (err) {
		if (err instanceof jwt.TokenExpiredError) {
			return res.status(401).json({
				message: "Token expired.",
			});
		}
		if (err instanceof jwt.JsonWebTokenError) {
			return res.status(401).json({
				message: "Invalid token.",
			});
		}
		return res.status(500).json({
			message: "Internal server error.",
		});
	}
};
