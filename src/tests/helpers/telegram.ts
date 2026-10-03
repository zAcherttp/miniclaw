import type { Bot } from "grammy";

export function makeBotInfo(overrides: Partial<Bot["botInfo"]> = {}): Bot["botInfo"] {
	return {
		id: 1234567,
		is_bot: true,
		first_name: "MyBot",
		username: "my_bot",
		can_join_groups: true,
		can_read_all_group_messages: false,
		supports_inline_queries: false,
		can_connect_to_business: false,
		has_main_web_app: false,
		has_topics_enabled: false,
		allows_users_to_create_topics: false,
		can_manage_bots: false,
		supports_join_request_queries: false,
		...overrides,
	};
}
