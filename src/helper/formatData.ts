import { ContentModel } from "../dbSchema.js";

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

export async function getFormattedData(userId: string) {
	const data = await ContentModel.find({ user: userId })
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
