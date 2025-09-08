import { Discord, Slash, SlashOption, Guard, SlashGroup } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, MessageFlags, InteractionContextType, ApplicationIntegrationType } from "discord.js";
import { AttendanceManager } from "../../managers/attendance/attendanceManager.js";
import { AttendanceHostGuard } from "../../utility/guards.js";

const attendanceManager = new AttendanceManager();

@Discord()
@SlashGroup({
  name: "attendance",
  description: "VRChat attendance tracking commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup("attendance")
@Guard(AttendanceHostGuard)
export class VRChatAttendancePasteCommand {

  @Slash({
    name: "paste",
    description: "Generate copyable attendance text in standard format."
  })
  async paste(
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

    let text = `Attendance for ${formatDate}\n\n`;
    
    // Host and Co-Host
    text += `Host: ${eventSummary.host ? `@${eventSummary.host.discordId}` : 'None'}\n`;
    text += `Co-Host: ${eventSummary.cohost ? `@${eventSummary.cohost.discordId}` : 'None'}\n`;
    
    // Staff
    if (eventSummary.staff.length > 0) {
      const staffList = eventSummary.staff
        .map(staff => `@${staff.user.discordId}`)
        .join(' ');
      text += `Staff: ${staffList}\n`;
    }
    
    text += '\n';

    // Squads
    for (const squad of eventSummary.squads) {
      const squadChannel = interaction.guild?.channels.cache.get(squad.name);
      const squadDisplayName = squadChannel?.name || squad.name;
      
      text += `${squadDisplayName}:\n`;
      
      if (squad.members.length === 0) {
        text += '*No members*\n\n';
        continue;
      }

      for (const member of squad.members) {
        let memberText = `@${member.user.discordId}`;
        
        const modifiers: string[] = [];
        if (member.isLead && !member.hasLeft) modifiers.push('(Lead)');
        if (member.isLate) modifiers.push('(Late)');
        if (member.isSplit && member.splitFrom) modifiers.push(`(Split from ${member.splitFrom})`);
        
        if (member.hasLeft) {
          // For left users, show special formatting
          if (member.isLead) {
            modifiers.push('(~~Lead~~)');
          }
          modifiers.push('(Left)');
          
          // Check if they rejoined (not left anymore in current state)
          // This would need additional logic if you track rejoin history
        }
        
        if (modifiers.length > 0) {
          memberText += ` ${modifiers.join(' ')}`;
        }
        
        text += `${memberText}\n`;
      }
      
      text += '\n';
    }

    // Send the formatted text in a code block for easy copying
    await interaction.reply({
      content: `\`\`\`\n${text}\`\`\``,
      flags: MessageFlags.Ephemeral
    });
  }
}
