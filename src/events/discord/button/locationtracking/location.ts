import { ButtonInteraction, MessageFlags } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { buildLocationTrackingContainer, getUserById } from "../../../../utility/vrchat.js";

@Discord()
export class LocationTrackingButtonHandler {
    @ButtonComponent({ id: /^(tracking|nottracking):.+/ })
    async handleLocationTrackingButton(interaction: ButtonInteraction) {
        const customId = interaction.customId;
        const [action, vrcUserId] = customId.split(":");
        const discordId = interaction.user.id;
        // Get user and verified accounts
        const user = await prisma.user.findUnique({ where: { discordId }, include: { vrchatAccounts: true } });
        if (!user || !user.vrchatAccounts) return;
        const verifiedAccounts = user.vrchatAccounts.filter((acc: any) => acc.accountType === "MAIN" || acc.accountType === "ALT");
        // Update consent in DB
        if (action === "tracking") {
            // Remove consent
            await prisma.friendLocationConsent.deleteMany({ where: { ownerVrcUserId: vrcUserId } });
            // Also remove location tracking entry for this user
            await prisma.friendLocation.deleteMany({ where: { vrcUserId } });
        } else {
            // Add consent if not exists
            const exists = await prisma.friendLocationConsent.findFirst({ where: { ownerVrcUserId: vrcUserId } });
            if (!exists) {
                // Find the User record for this Discord user
                const userRecord = await prisma.user.findUnique({ where: { discordId } });
                await prisma.friendLocationConsent.create({ data: { ownerVrcUserId: vrcUserId, ownerUserId: userRecord?.id } });
            }
        }
        // Rebuild consents, usernames, friendsMap
        const consents: Record<string, boolean> = {};
        const usernames: Record<string, string> = {};
        const friendsMap: Record<string, boolean> = {};
        for (const acc of verifiedAccounts) {
            consents[acc.vrcUserId] = !!(await prisma.friendLocationConsent.findFirst({ where: { ownerVrcUserId: acc.vrcUserId } }));
            try {
                const userInfo = await getUserById(acc.vrcUserId);
                usernames[acc.vrcUserId] = userInfo?.displayName || acc.vrcUserId;
                friendsMap[acc.vrcUserId] = userInfo?.isFriend ?? true;
            } catch (e) {
                usernames[acc.vrcUserId] = acc.vrcUserId;
                friendsMap[acc.vrcUserId] = true;
            }
        }
        const container = buildLocationTrackingContainer(verifiedAccounts, consents, usernames, friendsMap);
        await interaction.update({
            components: [container],
            flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2
        });
    }
}
