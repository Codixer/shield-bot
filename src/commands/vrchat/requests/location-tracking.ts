import { Discord, Slash, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
} from "discord.js";
import { VRChatLoginGuard } from "../../../utility/guards.js";
import { BotOwnerGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export class VRChatLocationTrackingCommand {
  @Slash({
    name: "location-tracking",
    description:
      "Toggle location tracking consent for your verified VRChat accounts.",
  })
  @Guard(BotOwnerGuard)
  async locationTracking(interaction: CommandInteraction) {
    const discordId = interaction.user.id;

    // Get all verified VRChat accounts for this user
    const user = await prisma.user.findUnique({
      where: { discordId },
      include: { vrchatAccounts: true },
    });

    if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
      await interaction.reply({
        content: "No verified VRChat accounts found for your Discord account.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // For now, just show the accounts - full implementation would toggle consent
    const accountList = user.vrchatAccounts
      .map(
        (acc: { vrchatUsername: string | null; vrcUserId: string; accountType: string }) => `${acc.vrchatUsername || acc.vrcUserId} (${acc.accountType})`,
      )
      .join("\n");

    await interaction.reply({
      content: `Found accounts:\n${accountList}\n\nLocation tracking toggle not yet implemented.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
