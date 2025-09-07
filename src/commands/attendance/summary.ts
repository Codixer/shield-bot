import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, EmbedBuilder, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { VRChatLoginGuard, AttendanceHostGuard } from "../../utility/guards.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("attendance")
@Guard(VRChatLoginGuard)
@Guard(AttendanceHostGuard)
export class VRChatAttendanceSummaryCommand {

  @Slash({
    name: "summary",
    description: "Show attendance summary for the active event."
  })
  async summary(
    @SlashOption({ name: "event_id", description: "Specific event ID (defaults to active event)", type: ApplicationCommandOptionType.Integer, required: false }) eventId: number,
    interaction: CommandInteraction
  ) {
    let targetEventId = eventId;
    
    if (!targetEventId) {
      const active = await attendanceManager.getActiveEventForInteraction(interaction);
      if (!active) {
        await interaction.reply({
          content: "No active attendance event found. Please specify an event ID or set an active event.",
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      targetEventId = active.eventId;
    }

    const eventSummary = await attendanceManager.getEventSummary(targetEventId);
    if (!eventSummary) {
      await interaction.reply({
        content: "Event not found.",
        flags: MessageFlags.Ephemeral
      });
      return;
    }

    const formatDate = eventSummary.date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    let description = `**Attendance for ${formatDate}**\n\n`;
    
    // Host and Co-Host
    description += `**Host:** ${eventSummary.host ? `<@${eventSummary.host.discordId}>` : 'None'}\n`;
    description += `**Co-Host:** ${eventSummary.cohost ? `<@${eventSummary.cohost.discordId}>` : 'None'}\n`;
    
    // Staff
    if (eventSummary.staff.length > 0) {
      const staffList = eventSummary.staff
        .map(staff => `<@${staff.user.discordId}>`)
        .join(' ');
      description += `**Staff:** ${staffList}\n`;
    }
    
    description += '\n';

    // Squads
    for (const squad of eventSummary.squads) {
      const squadChannel = interaction.guild?.channels.cache.get(squad.name);
      const squadDisplayName = squadChannel?.name || squad.name;
      
      description += `**${squadDisplayName}:**\n`;
      
      if (squad.members.length === 0) {
        description += '*No members*\n\n';
        continue;
      }

      for (const member of squad.members) {
        let memberText = `<@${member.user.discordId}>`;
        
        const modifiers: string[] = [];
        if (member.isLead) modifiers.push('Lead');
        if (member.isLate) modifiers.push('Late');
        if (member.isSplit && member.splitFrom) modifiers.push(`Split from ${member.splitFrom}`);
        
        if (member.hasLeft) {
          // Strike through and add (Left)
          memberText = `~~${memberText}~~`;
          if (member.isLead) {
            // Replace Lead with struck through lead
            const leadIndex = modifiers.indexOf('Lead');
            if (leadIndex !== -1) {
              modifiers[leadIndex] = '~~Lead~~';
            }
          }
          modifiers.push('Left');
        }
        
        if (modifiers.length > 0) {
          memberText += ` (${modifiers.join(', ')})`;
        }
        
        description += `${memberText}\n`;
      }
      
      description += '\n';
    }

    const embed = new EmbedBuilder()
      .setTitle(`Attendance Summary - Event ${targetEventId}`)
      .setDescription(description)
      .setColor(0x00AE86)
      .setTimestamp();

    await interaction.reply({
      embeds: [embed]
    });
  }
}
