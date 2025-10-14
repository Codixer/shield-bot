import { ButtonComponent, Discord, Guard } from "discordx";
import { ButtonInteraction, GuildMember, MessageFlags } from "discord.js";
import { patrolTimer } from "../../../../main.js";
import { StaffGuard } from "../../../../utility/guards.js";

@Discord()
export class PatrolButtonHandlers {
  @ButtonComponent({ id: /patrol-wipe-confirm:(\d+):(true|false)/ })
  @Guard(StaffGuard)
  async handleWipeConfirm(interaction: ButtonInteraction) {
    if (!interaction.guildId) return;    
    const [_, userId, ephemeralStr] = interaction.customId.split(":");
    // Check permissions again


    // Perform the wipe for the specific user
    await patrolTimer.reset(interaction.guildId, userId);

    await interaction.update({
      content: `✅ Successfully wiped all patrol data for <@${userId}>.`,
      components: [],
    });
  }

  @ButtonComponent({ id: /patrol-wipe-cancel:(\d+)/ })
  async handleWipeCancel(interaction: ButtonInteraction) {
    const [_, userId] = interaction.customId.split(":");
    
    await interaction.update({
      content: `❌ Cancelled wipe operation for <@${userId}>.`,
      components: [],
    });
  }
}