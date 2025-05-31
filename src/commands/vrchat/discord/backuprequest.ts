import { Discord, Slash, SlashOption, SlashChoice } from "discordx";
import { CommandInteraction, ApplicationCommandOptionType, ApplicationIntegrationType, ActionRowBuilder, ButtonBuilder, ButtonStyle, Message, MessageFlags } from "discord.js";

@Discord()
export default class BackupRequestCommand {
    @Slash({
        name: "backup-request",
        description: "Request a backup for SHIELD.",
        integrationTypes: [ApplicationIntegrationType.UserInstall],
    })
    async backupRequest(
        @SlashChoice({ name: "Standby Deputies", value: "999860674404569242" })
        @SlashChoice({ name: "Standby TRU", value: "999860876062498827" })
        @SlashChoice({ name: "Standby EMT", value: "999860757770543184" })
        @SlashOption({
            name: "role",
            description: "What role to ping/request (Standby Deputies, Standby TRU, Standby EMT)",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) role: string,
        @SlashOption({
            name: "situation",
            description: "Current Situation. Hostage, Active Shooter, Etc",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) situation: string,
        @SlashChoice({ name: "Adam", value: "814239808675119144" })
        @SlashChoice({ name: "Baker", value: "814239954641223760" })
        @SlashChoice({ name: "Coffee", value: "814240045405569038" })
        @SlashChoice({ name: "Delta", value: "814240176317923391" })
        @SlashChoice({ name: "Eagle", value: "814240290494742732" })
        @SlashChoice({ name: "Fitness", value: "814240677004836925" })
        @SlashChoice({ name: "Gamma", value: "814241070110998558" })
        @SlashChoice({ name: "Mag", value: "1012880059415150642" })
        @SlashChoice({ name: "EMT", value: "814932938961190953" })
        @SlashChoice({ name: "TRU", value: "814933108658274365" })
        @SlashOption({
            name: "squad",
            description: "Squad (Adam, Baker, Coffee, etc)",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) squad: string,
        @SlashChoice({ name: "Active (🔴)", value: "active" })
        @SlashChoice({ name: "Resolved (🟢)", value: "resolved" })
        @SlashOption({
            name: "status",
            description: "Status",
            type: ApplicationCommandOptionType.String,
            required: true,
        }) status: string,
        @SlashOption({
            name: "world",
            description: "World Link or Detected over vrc account",
            type: ApplicationCommandOptionType.String,
            required: false,
        }) world: string,
        interaction: CommandInteraction,
    ) {
        // Use role directly as roleId
        const roleId = role;

        // Use squad as the channel ID directly
        let squadChannelMention = "";
        if (squad) {
            squadChannelMention = `<#${squad}>`;
        }

        // Build the reply message in the requested format
        const roleMention = `<@&${roleId}>`;
        const requestType =
            roleId === "999860674404569242"
                ? "Standby Deputies"
                : roleId === "999860757770543184"
                ? "EMT"
                : roleId === "999860876062498827"
                ? "TRU"
                : "Backup";
        const worldText = world ? world : "-";
        const situationText = situation ? situation : "-";
        const squadText = squadChannelMention ? squadChannelMention : "-";
        const statusText = status === "active"
            ? "Active 🔴"
            : "Resolved 🟢";

        const replyMsg = `
\`\`\`        
${roleMention}
**Request:** ${requestType}
**World:** ${worldText}
**Situation:** ${situationText}
**Squad:** ${squadText}
**Status:** ${statusText}
\`\`\`
        `.trim();

        // // Add a button for "Situation Resolved." with the emoji
        // const resolvedButton = new ButtonBuilder()
        //     .setCustomId('situation_resolved')
        //     .setLabel('Situation Resolved')
        //     .setEmoji('🟢')
        //     .setStyle(ButtonStyle.Success);
        // const row = new ActionRowBuilder<ButtonBuilder>().addComponents(resolvedButton);

        await interaction.reply({
            content: replyMsg,
            // components: [row],
            flags: MessageFlags.Ephemeral
        });
    }

}
