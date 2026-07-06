import type mongoose from "mongoose";
import { ContentModel, TagModel } from "../dbSchema.js";

type LeanUser = {
	name: string;
};
type LeanTag = {
	name: string;
};
type LeanContent = {
	_id: mongoose.Types.ObjectId;
	title: string;
	content: string;
	user: LeanUser;
	tags: LeanTag[];
};

export async function getFormattedData(userId: string, tagName?: string) {
	const query: { user: string; tags?: mongoose.Types.ObjectId } = {
		user: userId,
	};
	if (tagName) {
		const tag = await TagModel.findOne({
			user: userId,
			name: tagName.toLowerCase().trim(),
		});
		if (!tag) {
			return [];
		}
		query.tags = tag._id;
	}
	const data = await ContentModel.find(query)
		.select("-__v")
		.populate([
			{ path: "user", select: "name -_id" },
			{ path: "tags", select: "name -_id" },
		])
		.lean<LeanContent[]>();

	return formatContent(data);
}

function formatContent(data: LeanContent[]) {
	return data.map((item) => ({
		id: item._id.toString(),
		title: item.title,
		content: item.content,
		name: item.user.name,
		tags: item.tags.map((tag) => tag.name),
	}));
}
