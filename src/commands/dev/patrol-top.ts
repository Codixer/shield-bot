import { Discord, Slash, SlashGroup } from "discordx";
import { CommandInteraction, MessageFlags } from "discord.js";
import { BotOwnerGuard } from "../../utility/guards.js";
import { Guard } from "discordx";
import { bot } from "../../main.js";
import { postPatrolTop } from "../../schedules/patrol/patrolTop.js";

@Discord()
@SlashGroup({
  name: "schedule",
  description: "Schedule management commands",
  root: "dev",
})
@SlashGroup("schedule", "dev")
@Guard(BotOwnerGuard)
export class ScheduleCommand {
  @Slash({
    name: "top",
    description: "Force trigger the patrol top schedule (Bot Owner only)",
  })
  async top(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      await postPatrolTop(bot);
      await interaction.editReply("✅ Patrol top schedule triggered successfully.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await interaction.editReply(`❌ Failed to trigger patrol top schedule: ${errorMessage}`);
    }
  }
}
