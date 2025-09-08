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
    name: "add-channel",
    description: "Add a channel to the enrolled channels for attendance."
  })
  async addChannel(
    @SlashOption({
      name: "channel",
      description: "Channel to add",
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

    if (enrolledChannels.includes(channel.id)) {
      await interaction.reply({
        content: `The channel <#${channel.id}> is already enrolled.`,
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    // Add the channel to the enrolledChannels array
    enrolledChannels.push(channel.id);

    // Update the database
    await prisma.guildSettings.update({
      where: { guildId },
      data: { enrolledChannels }
    });

    await interaction.reply({
      content: `Successfully added <#${channel.id}> to the enrolled channels.`,
      flags: MessageFlags.Ephemeral
    });
  }
}
