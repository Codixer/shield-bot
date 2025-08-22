import { Discord, Slash, SlashOption, SlashChoice, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { VRChatLoginGuard } from "../utility/guards.js";

@Discord()
export default class BlameNexyCommand {
  @Slash({
    name: "blamenexy",
    description: "Blame Nexy for a VRChat issue.",
    contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel, InteractionContextType.BotDM],
    integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
  })
  async blamenexy(
    @SlashOption({
      name: "reason",
      description: "Reason to blame Nexy",
      type: ApplicationCommandOptionType.String,
      required: true
    }) reason: string,
    interaction: CommandInteraction
  ) {
    await interaction.reply({
      content: `<@257140995446013953> caused this issue: **${reason}**`,
      allowedMentions: {
        users: ["257140995446013953"]
      }
    });
  }
}
