import { ContentModel, TagModel } from "../dbSchema.js";

type LeanUser = {
	name: string;
};
type LeanTag = {
	name: string;
};
type LeanContent = {
	title: string;
	content: string;
	user: LeanUser;
	tags: LeanTag[];
};

export async function getFormattedData(userId: string, tagName?: string) {
	const query: any = { user: userId };
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
		.select("-_id -__v")
		.populate([
			{ path: "user", select: "name -_id" },
			{ path: "tags", select: "name -_id" },
		])
		.lean<LeanContent[]>();

	return formatContent(data);
}

function formatContent(data: LeanContent[]) {
	return data.map((item) => ({
		title: item.title,
		content: item.content,
		name: item.user.name,
		tags: item.tags.map((tag) => tag.name),
	}));
}
