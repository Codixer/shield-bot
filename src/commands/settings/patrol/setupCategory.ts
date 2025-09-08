import { Discord, Slash, SlashGroup } from "discordx";
import { CommandInteraction, PermissionFlagsBits, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { prisma, bot } from "../../../main.js";
import { PatrolTimerManager } from "../../../managers/patrol/patrolTimerManager.js";

const patrolTimer = new PatrolTimerManager(bot);

@Discord()
@SlashGroup({
  name: "settings",
  description: "Bot configuration and settings commands",
  contexts: [InteractionContextType.Guild],
  integrationTypes: [ApplicationIntegrationType.GuildInstall]
})
@SlashGroup({
  description: "Patrol settings",
  name: "patrol",
  root: "settings"
})
export class PatrolSettingsCommands {

  @SlashGroup("patrol", "settings")
  @Slash({ name: "setup-category", description: "Set tracked voice category to your current voice channel's parent." })
  async setupPatrolCategory(interaction: CommandInteraction) {
    if (!interaction.guildId || !interaction.guild) return;

    const member = interaction.member as any;
    if (!member.permissions.has(PermissionFlagsBits.Administrator)) {
      await interaction.reply({ content: "Admin only.", flags: MessageFlags.Ephemeral });
      return;
    }

    const voice = member.voice?.channel;
    if (!voice || voice.type !== 2 || !voice.parentId) {
      await interaction.reply({ content: "Join a voice channel inside the desired category first.", flags: MessageFlags.Ephemeral });
      return;
    }

    await patrolTimer.setCategory(interaction.guildId, voice.parentId);
    await interaction.reply({ content: `Tracked category set to: ${voice.parent?.name ?? voice.parentId}`, flags: MessageFlags.Ephemeral });
  }
}
