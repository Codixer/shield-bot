import { ButtonInteraction, MessageFlags, ButtonStyle, EmbedBuilder } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { prisma } from "../../../../main.js";
import { ButtonBuilder } from "discord.js";

@Discord()
export class VRChatVerifyButtonHandler {
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
        // If the VRChat account exists and is owned by someone else, refuse verification
        if (vrcAccount && vrcAccount.userId !== user.id) {
            await interaction.reply({
                content: "❌ This VRChat account is already linked to another user. Please contact Codixer for assistance.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // Determine if user already has a MAIN account
        const hasMainAccount = await prisma.vRChatAccount.findFirst({ where: { userId: user.id, accountType: "MAIN" } });
        if (!vrcAccount) {
            // If no account exists, assign MAIN only if user has no MAIN, else ALT
            const accountType = hasMainAccount ? "ALT" : "MAIN";
            vrcAccount = await prisma.vRChatAccount.create({
                data: {
                    vrcUserId,
                    userId: user.id,
                    accountType,
                    verified: false
                }
            });
        } else {
            // If account exists, do not change accountType
            await prisma.vRChatAccount.update({
                where: { id: vrcAccount.id },
                data: { userId: user.id, verified: false }
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
