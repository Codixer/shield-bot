import { Get, Router } from "@discordx/koa";
import type { Context } from "koa";
import { readFileSync } from "fs";

@Router()
export class Home {
  @Get("/")
  async index(context: Context) {
    const file = readFileSync("public/index.html", "utf-8");
    context.body = file;
  }
}
