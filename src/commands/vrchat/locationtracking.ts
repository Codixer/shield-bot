import { CommandInteraction, MessageFlags, EmbedBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, SectionBuilder, TextDisplayBuilder } from "discord.js";
import { Discord, Guard, Slash, SlashGroup } from "discordx";
import { prisma } from "../../main.js";
import { VRChatLoginGuard } from "../../utility/guards.js";
import { getUserById } from "../../utility/vrchat.js";

@Discord()
@SlashGroup({ name: "vrchat", description: "VRChat related commands." })
@SlashGroup("vrchat")
@Guard(VRChatLoginGuard)
export class VRChatLocationTrackingCommand {

    
    @Slash({
        name: "locationtracking",
        description: "Toggle location tracking consent for your verified VRChat accounts."
    })
    async locationTracking(interaction: CommandInteraction) {
        const discordId = interaction.user.id;
        // Get all verified VRChat accounts for this user
        const user = await prisma.user.findUnique({ where: { discordId }, include: { vrchatAccounts: true } });
        if (!user || !user.vrchatAccounts || user.vrchatAccounts.length === 0) {
            await interaction.reply({
                content: "No verified VRChat accounts found for your Discord account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // List all verified accounts
        const verifiedAccounts = user.vrchatAccounts.filter(acc => acc.verified);
        if (verifiedAccounts.length === 0) {
            await interaction.reply({
                content: "No verified VRChat accounts found for your Discord account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Build new component-based UI
        const components = [];
        for (const acc of verifiedAccounts) {
            const consent = await prisma.friendLocationConsent.findFirst({
                where: { ownerVrcUserId: acc.vrcUserId }
            });
            const isTracking = !!consent;
            const button = new ButtonBuilder()
                .setStyle(isTracking ? ButtonStyle.Success : ButtonStyle.Danger)
                .setLabel(isTracking ? "Tracking" : "Not tracking")
                .setCustomId(isTracking ? `tracking_${acc.vrcUserId}` : `nottracking_${acc.vrcUserId}`);
            // Use getUserById from vrchat.ts to fetch username
            let username = acc.vrcUserId;
            try {
                const userInfo = await getUserById(acc.vrcUserId);
                if (userInfo && userInfo.displayName) {
                    username = userInfo.displayName;
                }
            } catch (e) {
                // fallback to vrcUserId
                console.error(`Failed to fetch user info for ${acc.vrcUserId}:`, e);
                username = acc.vrcUserId;
            }
            const section = new SectionBuilder()
                .setButtonAccessory(button)
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(username)
                );
            components.push(section);
        }
        const container = new ContainerBuilder();
        for (const section of components) {
            container.addSectionComponents(section);
        }
        await interaction.reply({
            components: [container],
            flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2]
        });
    }
}
