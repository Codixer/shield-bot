import { Discord, SelectMenuComponent } from "discordx";
import { StringSelectMenuInteraction, MessageFlags } from "discord.js";
import { prisma } from "../../../../main.js";

@Discord()
export class AutofillLeadsSelectMenuHandler {
  @SelectMenuComponent({ id: /autofill_lead_(\d+)_(\d+)/ })
  async handleLeadSelection(interaction: StringSelectMenuInteraction) {
    const parts = interaction.customId.split("_");
    const eventId = parseInt(parts[2], 10);
    const squadId = parseInt(parts[3], 10);

    // Get the event to verify the user has permission
    const event = await prisma.attendanceEvent.findUnique({
      where: { id: eventId },
      include: {
        host: true,
        cohost: true,
      },
    });

    if (!event) {
      await interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Only host and cohost can assign leads
    if (
      event.host?.discordId !== interaction.user.id &&
      event.cohost?.discordId !== interaction.user.id
    ) {
      await interaction.reply({
        content: "Only the event host or co-host can assign squad leads.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // Get the squad
    const squad = await prisma.squad.findUnique({
      where: { id: squadId },
      include: {
        members: {
          include: { user: true },
        },
      },
    });

    if (!squad) {
      await interaction.reply({
        content: "Squad not found.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    // First, clear all leads in this squad
    await prisma.squadMember.updateMany({
      where: { squadId: squad.id },
      data: { isLead: false },
    });

    // Set new leads based on selections
    if (interaction.values.length > 0) {
      const userIds = interaction.values.map((val) => {
        const [_, userIdStr] = val.split(":");
        return parseInt(userIdStr, 10);
      });

      await prisma.squadMember.updateMany({
        where: { squadId: squad.id, userId: { in: userIds } },
        data: { isLead: true },
      });

      const leadMembers = squad.members.filter((m) =>
        userIds.includes(m.userId),
      );
      const leadMentions = leadMembers
        .map((m) => `<@${m.user.discordId}>`)
        .join(", ");

      const squadChannel = interaction.guild?.channels.cache.get(squad.name);
      const squadDisplayName = squadChannel?.name || squad.name;

      await interaction.reply({
        content: `Set ${leadMentions} as lead(s) for **${squadDisplayName}**`,
        flags: MessageFlags.Ephemeral,
      });
    } else {
      // No selection - leads were cleared
      const squadChannel = interaction.guild?.channels.cache.get(squad.name);
      const squadDisplayName = squadChannel?.name || squad.name;

      await interaction.reply({
        content: `Cleared all leads for **${squadDisplayName}**`,
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
