import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags } from "discord.js";
import { VRChatLoginGuard, AttendanceHostGuard, StaffGuard } from "../../../utility/guards.js";
import { prisma } from "../../../main.js";

@Discord()
@SlashGroup({
  name: "settings",
  description: "Settings commands."
})
@SlashGroup("settings", "attendance")
@Guard(VRChatLoginGuard)
@Guard(StaffGuard)
export class AttendanceSettingsCommand {

  @Slash({
    name: "remove-channel",
    description: "Remove a channel from the enrolled channels for attendance."
  })
  async removeChannel(
    @SlashOption({
      name: "channel",
      description: "Channel to remove",
      type: ApplicationCommandOptionType.Channel,
      required: true
    }) channel: any,
    interaction: CommandInteraction
  ) {
    if (!interaction.guildId) {
      await interaction.reply({
        content: "This command can only be used in a server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const guildId = interaction.guildId;

    // Fetch the current guild settings
    const settings = await prisma.guildSettings.findUnique({ where: { guildId } });

    if (!settings) {
      await interaction.reply({
        content: "No settings found for this server.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const enrolledChannels = (settings.enrolledChannels as string[]) || [];

    if (!enrolledChannels.includes(channel.id)) {
      await interaction.reply({
        content: `The channel <#${channel.id}> is not enrolled.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Remove the channel from the enrolledChannels array
    const updatedChannels = enrolledChannels.filter(id => id !== channel.id);

    // Update the database
    await prisma.guildSettings.update({
      where: { guildId },
      data: { enrolledChannels: updatedChannels }
    });

    await interaction.reply({
      content: `Successfully removed <#${channel.id}> from the enrolled channels.`,
      flags: MessageFlags.Ephemeral
    });
  }
}
