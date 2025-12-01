import {
    CommandInteraction,
    EmbedBuilder,
    Colors,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    InteractionContextType,
    ApplicationIntegrationType,
    ApplicationCommandOptionType,
} from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { loggers } from "../../../utility/logger.js";

interface StatusIncident {
    id: string;
    name: string;
    status: string;
    created_at: string;
    updated_at: string;
    monitoring_at: string | null;
    resolved_at: string | null;
    impact: string;
    shortlink: string;
    components: Array<{
        id: string;
        name: string;
        status: string;
    }>;
    incident_updates: Array<{
        id: string;
        status: string;
        body: string;
        created_at: string;
        updated_at: string;
    }>;
}

@Discord()
@SlashGroup({
    name: "vrchat",
    description: "VRChat related commands.",
    contexts: [
        InteractionContextType.Guild,
        InteractionContextType.PrivateChannel,
    ],
    integrationTypes: [
        ApplicationIntegrationType.GuildInstall,
        ApplicationIntegrationType.UserInstall,
    ],
})
@SlashGroup("vrchat")
export class VRChatStatusCommand {
    @Slash({
        name: "status",
        description: "Check VRChat service status and incidents (use show_history option for history)",
    })
    async status(
        @SlashOption({
            name: "show_history",
            description: "Show incident history instead of current status",
            type: ApplicationCommandOptionType.Boolean,
            required: false,
        })
        showHistory: boolean | null,
        interaction: CommandInteraction,
    ) {
        const showHistoryFlag = showHistory ?? false;
        await interaction.deferReply();

        try {
            const response = await fetch(
                "https://status.vrchat.com/api/v2/incidents.json",
            );
            const data = await response.json();
            const incidents: StatusIncident[] = data.incidents;

            if (!incidents || incidents.length === 0) {
                const embed = new EmbedBuilder()
                    .setTitle("✅ VRChat Status")
                    .setDescription("All systems operational. No active incidents.")
                    .setColor(Colors.Green)
                    .setTimestamp()
                    .setFooter({ text: "VRChat Status" });

                await interaction.editReply({ embeds: [embed] });
                return;
            }

            // Get the most recent incident
            const activeIncident = incidents[0];

            // Create embed for active incident
            const embed = new EmbedBuilder()
                .setTitle(`⚠️ ${activeIncident.name}`)
                .setDescription(activeIncident.status.toUpperCase())
                .setColor(
                    activeIncident.status === "resolved" ? Colors.Green : Colors.Red,
                )
                .addFields(
                    {
                        name: "Impact",
                        value: activeIncident.impact.toUpperCase(),
                        inline: true,
                    },
                    {
                        name: "Status",
                        value: activeIncident.status.toUpperCase(),
                        inline: true,
                    },
                    {
                        name: "Created",
                        value: new Date(activeIncident.created_at).toLocaleString(),
                        inline: false,
                    },
                );

            if (activeIncident.resolved_at) {
                embed.addFields({
                    name: "Resolved",
                    value: new Date(activeIncident.resolved_at).toLocaleString(),
                    inline: false,
                });
            }

            // Add affected components
            if (activeIncident.components.length > 0) {
                const componentList = activeIncident.components
                    .map((c) => `• ${c.name} - ${c.status}`)
                    .join("\n");
                embed.addFields({
                    name: "Affected Components",
                    value: componentList || "None",
                    inline: false,
                });
            }

            // Add latest update
            if (
                activeIncident.incident_updates &&
                activeIncident.incident_updates.length > 0
            ) {
                const latestUpdate = activeIncident.incident_updates[0];
                const updateText =
                    latestUpdate.body.length > 1024
                        ? latestUpdate.body.substring(0, 1021) + "..."
                        : latestUpdate.body;
                embed.addFields({
                    name: "Latest Update",
                    value: updateText,
                    inline: false,
                });
            }

            embed.setTimestamp().setFooter({ text: "VRChat Status Page" });

            // Create button for full history
            const button = new ButtonBuilder()
                .setLabel("View Full History")
                .setStyle(ButtonStyle.Link)
                .setURL(activeIncident.shortlink);

            const row = new ActionRowBuilder<ButtonBuilder>().addComponents(button);

            await interaction.editReply({
                embeds: [embed],
                components: [row],
            });
        } catch (error) {
            loggers.vrchat.error("Error fetching VRChat status", error);
            const errorEmbed = new EmbedBuilder()
                .setTitle("❌ Error")
                .setDescription("Failed to fetch VRChat status information.")
                .setColor(Colors.Red);

            await interaction.editReply({ embeds: [errorEmbed] });
        }

        // Handle history view
        if (showHistoryFlag) {
            try {
                const response = await fetch(
                    "https://status.vrchat.com/api/v2/incidents.json",
                );
                const data = await response.json();
                const incidents: StatusIncident[] = data.incidents;

                if (!incidents || incidents.length === 0) {
                    const embed = new EmbedBuilder()
                        .setTitle("📋 No Incidents")
                        .setDescription("No incident history available.")
                        .setColor(Colors.Blue);

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                const incident = incidents[0];

                if (
                    !incident.incident_updates ||
                    incident.incident_updates.length === 0
                ) {
                    const embed = new EmbedBuilder()
                        .setTitle(`📋 ${incident.name} - History`)
                        .setDescription("No update history available for this incident.")
                        .setColor(Colors.Blue);

                    await interaction.editReply({ embeds: [embed] });
                    return;
                }

                // Create embeds for each update (up to 10)
                const embeds: EmbedBuilder[] = [];
                const updates = incident.incident_updates.slice(0, 10);

                updates.forEach((update, index) => {
                    const updateEmbed = new EmbedBuilder()
                        .setTitle(`${incident.name} - Update ${index + 1}`)
                        .setDescription(update.body)
                        .addFields({
                            name: "Status",
                            value: update.status.toUpperCase(),
                            inline: true,
                        })
                        .addFields({
                            name: "Posted",
                            value: new Date(update.created_at).toLocaleString(),
                            inline: true,
                        })
                        .setColor(
                            update.status === "resolved" ? Colors.Green : Colors.Orange,
                        )
                        .setFooter({
                            text: `Update ${index + 1} of ${Math.min(updates.length, 10)}`,
                        });

                    embeds.push(updateEmbed);
                });

                await interaction.editReply({ embeds });
            } catch (error) {
                loggers.vrchat.error("Error fetching incident history", error);
                const errorEmbed = new EmbedBuilder()
                    .setTitle("❌ Error")
                    .setDescription("Failed to fetch incident history.")
                    .setColor(Colors.Red);

                await interaction.editReply({ embeds: [errorEmbed] });
            }
        }
    }
}
