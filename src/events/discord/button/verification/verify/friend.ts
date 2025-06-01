import { ButtonInteraction, MessageFlags, ButtonStyle, EmbedBuilder } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { ButtonBuilder } from "discord.js";
import { sendFriendRequest, unfriendUser } from "../../../../../utility/vrchat.js";
import { prisma } from "../../../../../main.js";

@Discord()
export class VRChatFriendVerifyButtonHandler {
    @ButtonComponent({ id: /vrchat-friend:(\d+):([a-zA-Z0-9\-_]+)/ })
    async handleFriendRequest(interaction: ButtonInteraction) {
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        // Backend logic to send friend request
        let friendRequestSent = false;
        let errorMsg = "";
        try {
            await sendFriendRequest(vrcUserId);
            friendRequestSent = true;
        } catch (err: any) {
            if (err.message && err.message.includes("400")) {
                // Already friends, unfriend and try again
                try {
                    await unfriendUser(vrcUserId);
                    await sendFriendRequest(vrcUserId);
                    friendRequestSent = true;
                } catch (err2: any) {
                    errorMsg = err2.message || "Failed to unfriend and re-friend user.";
                }
            } else {
                errorMsg = err.message || "Failed to send friend request.";
            }
        }
        let embed;
        if (friendRequestSent) {
            embed = new EmbedBuilder()
                .setTitle("Friend Request Sent")
                .setDescription(`A friend request has been sent to your VRChat account (**${vrcUserId}**).\n\nOnce you accept the friend request in VRChat, click **Verify status** below or wait for automatic verification.`)
                .setColor(0x57F287);
        } else {
            embed = new EmbedBuilder()
                .setTitle("Friend Request Failed")
                .setDescription(`Could not send a friend request to your VRChat account (**${vrcUserId}**).\n${errorMsg}`)
                .setColor(0xED4245);
        }
        const verifyBtn = new ButtonBuilder()
            .setCustomId(`vrchat-friend-verify:${discordId}:${vrcUserId}`)
            .setLabel("Verify status")
            .setStyle(ButtonStyle.Success);
        await interaction.update({
            embeds: [embed],
            components: [{ type: 1, components: [verifyBtn] }]
        });
    }

    @ButtonComponent({ id: /vrchat-friend-verify:(\d+):([a-zA-Z0-9\-_]+)/ })
    async handleFriendVerify(interaction: ButtonInteraction) {
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        // Check if the user has been verified in the database
        const vrcAccount = await prisma.vRChatAccount.findFirst({
            where: {
                vrcUserId,
                user: { discordId },
                verified: true
            },
            include: { user: true }
        });
        if (vrcAccount) {
            const embed = new EmbedBuilder()
                .setTitle("Verification Successful")
                .setDescription(`Your VRChat account (**${vrcUserId}**) has been successfully verified via friend request!`)
                .setColor(0x57F287);
            await interaction.update({
                embeds: [embed]
            });
        } else {
            const embed = new EmbedBuilder()
                .setTitle("Not Verified Yet")
                .setDescription(`You are not verified yet. Please make sure you have accepted the friend request from the bot in VRChat, then press **Verify status** again.`)
                .setColor(0xED4245);
            const verifyBtn = new ButtonBuilder()
                .setCustomId(`vrchat-friend-verify:${discordId}:${vrcUserId}`)
                .setLabel("Verify status")
                .setStyle(ButtonStyle.Success);
            await interaction.update({
                embeds: [embed],
                components: [{ type: 1, components: [verifyBtn] }]
            });
        }
    }
}
