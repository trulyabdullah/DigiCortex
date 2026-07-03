import mongoose from "mongoose";

const Schema = mongoose.Schema;

const UserSchema = new Schema({
	name: { type: String, required: true, trim: true, minLength: 3 },
	email: {
		type: String,
		required: true,
		unique: true,
		lowercase: true,
		trim: true,
	},
	password: { type: String, required: true, select: false },
});

const ContentSchema = new Schema({
	title: { type: String, required: true, trim: true },
	content: { type: String, required: true, trim: true },
	user: {
		type: Schema.Types.ObjectId,
		ref: "User",
		required: true,
	},
	tags: { type: [{ type: Schema.Types.ObjectId, ref: "Tag" }], default: [] },
});

const TagSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "User", required: true },
	name: {
		type: String,
		required: true,
		lowercase: true,
		trim: true,
	},
});

ContentSchema.index({ user: 1 });
TagSchema.index({ user: 1, name: 1 }, { unique: true });

export const UserModel = mongoose.model("User", UserSchema);
export const ContentModel = mongoose.model("Content", ContentSchema);
export const TagModel = mongoose.model("Tag", TagSchema);
