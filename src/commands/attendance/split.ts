import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  AutocompleteInteraction,
  BaseInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
  User,
} from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { AttendanceHostGuard } from "../../utility/guards.js";
import { prisma } from "../../main.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("attendance")
@Guard(AttendanceHostGuard)
export class VRChatAttendanceSplitCommand {
  @Slash({
    name: "split",
    description: "Split user to squad.",
  })
  async split(
    @SlashOption({
      name: "user",
      description: "Discord User",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: User,
    @SlashOption({
      name: "squad",
      description: "Squad",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    squad: string,
    interaction: BaseInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      if (focused.name === "squad") {
        if (!autoInteraction.guildId) {return;}
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: autoInteraction.guildId },
        });
        const enrolled = (settings?.enrolledChannels as string[]) || [];
        const guild = autoInteraction.guild;
        if (!guild) {return;}
        const choices = [];
        for (const channelId of enrolled) {
          const channel = guild.channels.cache.get(channelId);
          if (
            channel &&
            channel.name.toLowerCase().includes(focused.value.toLowerCase())
          ) {
            choices.push({ name: channel.name, value: channelId });
          }
        }
        await autoInteraction.respond(choices.slice(0, 25));
      }
      return;
    }

    const cmdInteraction = interaction as CommandInteraction;
    const active =
      await attendanceManager.getActiveEventForInteraction(cmdInteraction);
    if (!active) {
      await cmdInteraction.reply({
        content: "No active attendance event found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const { eventId } = active;
    const dbUser = await attendanceManager.findOrCreateUserByDiscordId(user.id);

    // Get current squad for the user
    const currentMember = await prisma.squadMember.findFirst({
      where: { userId: dbUser.id, squad: { eventId } },
      include: { squad: true },
    });

    const previousSquadChannelId = currentMember?.squad?.name || null;
    
    // Resolve previous squad channel name
    let previousSquadName = previousSquadChannelId;
    if (previousSquadChannelId) {
      const previousSquadChannel = cmdInteraction.guild?.channels.cache.get(previousSquadChannelId);
      previousSquadName = previousSquadChannel?.name || previousSquadChannelId;
    }

    await attendanceManager.moveUserToSquad(eventId, dbUser.id, squad);

    const squadChannel = cmdInteraction.guild?.channels.cache.get(squad);
    const squadName = squadChannel?.name || squad;

    await cmdInteraction.reply({
      content: `Split <@${user.id}> to ${squadName}${previousSquadName ? ` (Split from ${previousSquadName})` : ""}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
