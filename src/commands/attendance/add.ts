import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import {
  CommandInteraction,
  ApplicationCommandOptionType,
  MessageFlags,
  AutocompleteInteraction,
  BaseInteraction,
  InteractionContextType,
  ApplicationIntegrationType,
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
    InteractionContextType.PrivateChannel,
  ],
  integrationTypes: [
    ApplicationIntegrationType.UserInstall,
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("attendance")
@Guard(AttendanceHostGuard)
export class VRChatAttendanceAddCommand {
  @Slash({
    name: "add",
    description: "Add user to squad.",
  })
  async add(
    @SlashOption({
      name: "user",
      description: "Discord User",
      type: ApplicationCommandOptionType.User,
      required: true,
    })
    user: any,
    @SlashOption({
      name: "squad",
      description: "Squad",
      type: ApplicationCommandOptionType.String,
      required: true,
      autocomplete: true,
    })
    squad: string,
    @SlashOption({
      name: "as_lead",
      description: "Mark as squad lead",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    asLead: boolean,
    @SlashOption({
      name: "as_staff",
      description: "Mark as staff",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    asStaff: boolean,
    @SlashOption({
      name: "as_late",
      description: "Mark as late",
      type: ApplicationCommandOptionType.Boolean,
      required: false,
    })
    asLate: boolean,
    interaction: BaseInteraction,
  ) {
    if (interaction.isAutocomplete()) {
      const autoInteraction = interaction as AutocompleteInteraction;
      const focused = autoInteraction.options.getFocused(true);
      if (focused.name === "squad") {
        if (!autoInteraction.guildId) return;
        const settings = await prisma.guildSettings.findUnique({
          where: { guildId: autoInteraction.guildId },
        });
        const enrolled = (settings?.enrolledChannels as string[]) || [];
        const guild = autoInteraction.guild;
        if (!guild) return;
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
    await attendanceManager.addUserToSquad(eventId, dbUser.id, squad);

    // Apply additional modifiers
    if (asLead) {
      await attendanceManager.markUserAsLead(eventId, dbUser.id);
    }

    if (asStaff) {
      await attendanceManager.addStaff(eventId, dbUser.id);
    }

    if (asLate) {
      await attendanceManager.markUserAsLate(eventId, dbUser.id);
    }

    const squadChannel = cmdInteraction.guild?.channels.cache.get(squad);
    const squadName = squadChannel?.name || squad;

    const modifiers: string[] = [];
    if (asLead) modifiers.push("Lead");
    if (asStaff) modifiers.push("Staff");
    if (asLate) modifiers.push("Late");

    const modifierText =
      modifiers.length > 0 ? ` (${modifiers.join(", ")})` : "";

    await cmdInteraction.reply({
      content: `Added <@${user.id}> to ${squadName}${modifierText}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}
