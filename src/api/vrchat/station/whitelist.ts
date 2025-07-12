import { Get, Router } from "@discordx/koa";
import type { Context } from "koa";
import { prisma } from "../../../main";

@Router()
export class Whitelist {
  @Get("/vrchat/station/whitelist")
  async getWhitelist(context: Context) {
    // Get all verified VRChat accounts
    const verifiedAccounts = await prisma.vRChatAccount.findMany({
      where: { verified: true },
      select: { vrcUserId: true },
    });
    context.body = verifiedAccounts.map((acc: any) => acc.vrcUserId);
  }

  @Get("/vrchat/station/:username/whitelist")
  async isUserWhitelisted(context: Context) {
    const { username } = context.params;
    // Check if the user is verified
    const account = await prisma.vRChatAccount.findFirst({
      where: { vrcUserId: username, verified: true },
    });
    context.body = { whitelisted: !!account };
  }

  @Get("/vrchat/station/usernames")
  async getUsernames(context: Context) {
    // Get all VRChat usernames
    const accounts = await prisma.vRChatAccount.findMany({
      select: { vrcUserId: true },
    });
    context.body = accounts.map((acc: any) => acc.vrcUserId);
  }
}
