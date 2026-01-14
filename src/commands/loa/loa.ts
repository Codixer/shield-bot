import { Discord, Slash, SlashGroup, SlashOption, Guard } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  Colors,
  User,
} from "discord.js";
import { GuildGuard, StaffGuard } from "../../utility/guards.js";
import { loaManager } from "../../main.js";
import { formatDuration } from "../../utility/timeParser.js";

@Discord()
@SlashGroup({
  name: "loa",
  description: "Leave of Absence management commands",
})
@SlashGroup("loa")
@Guard(GuildGuard)
export class LOACommands {
  @Slash({
    name: "request",
    description: "Request a leave of absence",
  })
  async request(
    @SlashOption({
      name: "time",
      description: "Duration (e.g., '2 weeks', '14 days', '1 month')",
      type: ApplicationCommandOptionType.String,
      required: true,
    })
    time: string,
    @SlashOption({
      name: "reason",
      description: "Reason for the LOA",
      type: ApplicationCommandOptionType.String,
      required: true,
      maxLength: 1024,
    })
    reason: string,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Check cooldown first (fast check, can reply immediately if error)
    const cooldown = await loaManager.checkCooldown(interaction.guildId, interaction.user.id);
    if (cooldown.inCooldown && cooldown.cooldownEndDate) {
      const cooldownEnd = cooldown.cooldownEndDate.toLocaleString();
      await interaction.reply({
        content: `❌ You are in a cooldown period until ${cooldownEnd}. You cannot request a new LOA until then.`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Defer interaction (without ephemeral flag so the message can be public)
    await interaction.deferReply();

    // Request LOA
    const result = await loaManager.requestLOA(
      interaction.guildId,
      interaction.user.id,
      time,
      reason,
    );

    if (!result.success) {
      await interaction.editReply({
        content: `❌ Failed to create LOA request: ${result.error}`,
      });
      return;
    }

    const loa = result.loa;

    // Create embed
    const embed = new EmbedBuilder()
      .setTitle("Leave of Absence Request")
      .setDescription(`**User:** <@${interaction.user.id}>\n**Status:** Pending Approval`)
      .addFields(
        {
          name: "Duration",
          value: formatDuration(loa.endDate.getTime() - loa.startDate.getTime()),
          inline: true,
        },
        {
          name: "Start Date",
          value: `<t:${Math.floor(loa.startDate.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "End Date",
          value: `<t:${Math.floor(loa.endDate.getTime() / 1000)}:F>`,
          inline: true,
        },
        {
          name: "Reason",
          value: loa.reason.length > 1024 ? loa.reason.slice(0, 1021) + "…" : loa.reason,
        },
      )
      .setColor(Colors.Orange)
      .setTimestamp();

    // Create buttons
    const approveButton = new ButtonBuilder()
      .setCustomId(`loa:approve:${loa.id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success);

    const denyButton = new ButtonBuilder()
      .setCustomId(`loa:deny:${loa.id}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(approveButton, denyButton);

    // Send public message (not ephemeral so staff can see it)
    await interaction.editReply({
      embeds: [embed],
      components: [row],
    });
  }

  @Slash({
    name: "remove-cooldown",
    description: "Remove the LOA cooldown for a user (allows them to request a new LOA immediately)",
  })
  @Guard(StaffGuard)
  async removeCooldown(
    @SlashOption({
      name: "user",
      description: "The user whose cooldown should be removed",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
    interaction: CommandInteraction,
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const result = await loaManager.removeCooldown(interaction.guildId, user.id);

    if (!result.success) {
      await interaction.reply({
        content: `❌ Failed to remove cooldown: ${result.error}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.reply({
      content: `✅ Removed LOA cooldown for <@${user.id}>. They can now request a new LOA immediately.`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
