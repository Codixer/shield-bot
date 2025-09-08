import { Discord, Slash, SlashGroup } from "discordx";
import { CommandInteraction, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";

@Discord()
// Root settings group definition
@SlashGroup({
  name: "settings",
  description: "Bot configuration and settings commands",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
// Assign subsequent slashes in this class to the root group
export class SettingsRootGroup {
}
