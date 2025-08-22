import { ButtonInteraction, MessageFlags, ButtonStyle, EmbedBuilder } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { ButtonBuilder } from "discord.js";

@Discord()
export class VRChatVerifyButtonHandler {
    @ButtonComponent({
        id: /vrchat-add:(\d+):([a-zA-Z0-9\-_]+)/
    })
    async handleAdd(interaction: ButtonInteraction) {
        // Extract discordId and vrcUserId by splitting the custom_id
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        if (!discordId || !vrcUserId) {
            await interaction.reply({
                content: "Could not determine Discord or VRChat user ID from the button.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Create or update a VRChatAccount record for unverified binding
        let user = await prisma.user.findUnique({ where: { discordId } });
        if (!user) {
            user = await prisma.user.create({ data: { discordId } });
        }

        let vrcAccount = await prisma.vRChatAccount.findFirst({ where: { vrcUserId } });
        
        // Check if account exists and is fully verified - if so, refuse takeover
        if (vrcAccount && (vrcAccount.accountType === "MAIN" || vrcAccount.accountType === "ALT")) {
            await interaction.reply({
                content: "❌ This VRChat account is fully verified and protected from takeover. Please contact the current owner or use a different account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // If account exists but is only unverified bound, allow takeover
        if (vrcAccount && vrcAccount.accountType === "UNVERIFIED") {
            // Transfer account to new user but keep as UNVERIFIED until verification
            
            // Get VRChat username for caching
            const { getUserById } = await import("../../../../utility/vrchat.js");
            let vrchatUsername = null;
            try {
                const userInfo = await getUserById(vrcUserId);
                vrchatUsername = userInfo?.displayName || userInfo?.username;
            } catch (e) {
                console.warn(`Failed to fetch username for ${vrcUserId}:`, e);
            }

            vrcAccount = await prisma.vRChatAccount.update({
                where: { id: vrcAccount.id },
                data: {
                    userId: user.id,
                    accountType: "UNVERIFIED",
                    verificationCode: null,
                    vrchatUsername,
                    usernameUpdatedAt: new Date()
                }
            });

            const embed = new EmbedBuilder()
                .setTitle("✅ Account Transferred")
                .setDescription(`The VRChat account **${vrcUserId}** has been transferred to your Discord account as **UNVERIFIED**.\n\n⚠️ **Remember**: This account is only "unverified bound" and can be stolen by others until you fully verify it with \`/vrchat verify\`.`)
                .setColor(0xFFA500);

            await interaction.update({
                embeds: [embed],
                components: []
            });
            return;
        }

        // If no account exists, create new unverified bound account
        if (!vrcAccount) {
            // Get VRChat username for caching
            const { getUserById } = await import("../../../../utility/vrchat.js");
            let vrchatUsername = null;
            try {
                const userInfo = await getUserById(vrcUserId);
                vrchatUsername = userInfo?.displayName || userInfo?.username;
            } catch (e) {
                console.warn(`Failed to fetch username for ${vrcUserId}:`, e);
            }

            vrcAccount = await prisma.vRChatAccount.create({
                data: {
                    vrcUserId,
                    userId: user.id,
                    accountType: "UNVERIFIED",
                    vrchatUsername,
                    usernameUpdatedAt: new Date()
                }
            });

            const embed = new EmbedBuilder()
                .setTitle("✅ Account Added")
                .setDescription(`The VRChat account **${vrcUserId}** has been added to your Discord account as **UNVERIFIED**.\n\n⚠️ **Remember**: This account is only "unverified bound" and can be stolen by others until you fully verify it with \`/vrchat verify\`.`)
                .setColor(0xFFA500);

            await interaction.update({
                embeds: [embed],
                components: []
            });
            return;
        }
    }

    @ButtonComponent({
        id: /vrchat-verify:(\d+):([a-zA-Z0-9\-_]+)/
    })
    async handleConfirm(interaction: ButtonInteraction) {
        // Extract discordId and vrcUserId by splitting the custom_id
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        if (!discordId || !vrcUserId) {
            await interaction.reply({
                content: "Could not determine Discord or VRChat user ID from the button.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Create or update a VRChatAccount record to start the verification process
        let user = await prisma.user.findUnique({ where: { discordId } });
        if (!user) {
            user = await prisma.user.create({ data: { discordId } });
        }
        let vrcAccount = await prisma.vRChatAccount.findFirst({ where: { vrcUserId } });
        
        // If the VRChat account exists and is fully verified by someone else, refuse verification
        if (vrcAccount && vrcAccount.userId !== user.id && (vrcAccount.accountType === "MAIN" || vrcAccount.accountType === "ALT")) {
            await interaction.reply({
                content: "❌ This VRChat account is fully verified and protected from takeover. Please contact the current owner or use a different account.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }

        // Get VRChat username for caching
        const { getUserById } = await import("../../../../utility/vrchat.js");
        let vrchatUsername = null;
        try {
            const userInfo = await getUserById(vrcUserId);
            vrchatUsername = userInfo?.displayName || userInfo?.username;
        } catch (e) {
            console.warn(`Failed to fetch username for ${vrcUserId}:`, e);
        }

        // Determine if user already has a MAIN account
        const hasMainAccount = await prisma.vRChatAccount.findFirst({ where: { userId: user.id, accountType: "MAIN" } });
        
        if (!vrcAccount) {
            // If no account exists, create as IN_VERIFICATION for verified linking
            vrcAccount = await prisma.vRChatAccount.create({
                data: {
                    vrcUserId,
                    userId: user.id,
                    accountType: "IN_VERIFICATION",
                    vrchatUsername,
                    usernameUpdatedAt: new Date()
                }
            });
        } else {
            // If account exists, update it to belong to this user and set as IN_VERIFICATION
            await prisma.vRChatAccount.update({
                where: { id: vrcAccount.id },
                data: { 
                    userId: user.id,
                    accountType: "IN_VERIFICATION",
                    vrchatUsername,
                    usernameUpdatedAt: new Date()
                }
            });
        }

        // Use the extracted IDs for the next step's buttons
        const verifyEmbed = new EmbedBuilder()
            .setTitle("How would you like to verify?")
            .setDescription("Choose a verification method:")
            .setColor(0x5865F2)
            .addFields(
                { name: "Friend request :busts_in_silhouette:", value: "Send a friend request to your VRChat account and verify when accepted.", inline: false },
                { name: "Change status", value: "Change your VRChat status to a special code to verify.", inline: false }
            );
        const friendBtn = new ButtonBuilder()
            .setCustomId(`vrchat-friend:${discordId}:${vrcUserId}`)
            .setLabel("Friend request")
            .setStyle(ButtonStyle.Primary)
            .setEmoji("👥");
        const statusBtn = new ButtonBuilder()
            .setCustomId(`vrchat-status:${discordId}:${vrcUserId}`)
            .setLabel("Change status")
            .setStyle(ButtonStyle.Secondary);
        await interaction.update({
            embeds: [verifyEmbed],
            components: [{ type: 1, components: [friendBtn, statusBtn] }]
        });
    }

    @ButtonComponent({ id: "vrchat-verify-try-again" })
    async handleTryAgain(interaction: ButtonInteraction) {
        await interaction.update({
            content: "❌ Verification cancelled. Please use `/vrchat verify` again to restart the process."
        });
    }
    
}
