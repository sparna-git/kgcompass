import pino from "pino";
import { ConfigProvider } from "../config/ConfigProvider";

// Logger pour la console
const logger = pino({
  level: ConfigProvider.getInstance().getConfig().log?.level || "info",
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "SYS:dd-mm-yyyy HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
  base: {
    pid: false,
    hostname: false,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;
