import pino from "pino";
const transport = process.stdout.isTTY
    ? {
          transport: {
              target: "pino-pretty",
              options: {
                  colorize: true,
                  translateTime: "SYS:standard",
                  levelFirst: true,
              },
          },
      }
    : {};

const logger = pino({
    level: process.env["LOG_LEVEL"] || "info",
    ...transport,
});

export default logger;
