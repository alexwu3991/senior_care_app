CREATE TABLE `message_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`seniorId` int NOT NULL,
	`direction` enum('outbound','inbound') NOT NULL,
	`messageText` text NOT NULL,
	`lineMessageId` varchar(100),
	`sentAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `message_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `seniors` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`phone` varchar(20) NOT NULL,
	`address` text NOT NULL,
	`health` enum('良好','慢性病','行動不便','需定期回診','其他') NOT NULL DEFAULT '良好',
	`healthNote` text,
	`lineUserId` varchar(64),
	`lineDisplayName` varchar(100),
	`status` enum('green','yellow','red','gray') NOT NULL DEFAULT 'gray',
	`lastReportTime` bigint,
	`messageSentTime` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `seniors_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` int AUTO_INCREMENT NOT NULL,
	`openId` varchar(64) NOT NULL,
	`name` text,
	`email` varchar(320),
	`loginMethod` varchar(64),
	`role` enum('user','admin') NOT NULL DEFAULT 'user',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`lastSignedIn` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_openId_unique` UNIQUE(`openId`)
);
