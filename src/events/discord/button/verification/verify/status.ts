import { ButtonInteraction, MessageFlags, ButtonStyle, EmbedBuilder } from "discord.js";
import { Discord, ButtonComponent } from "discordx";
import { ButtonBuilder } from "discord.js";
import { prisma } from "../../../../../main.js";
import { getUserById } from "../../../../../utility/vrchat.js";

@Discord()
export class VRChatStatusVerifyButtonHandler {
    @ButtonComponent({ id: /vrchat-status:(\d+):([a-zA-Z0-9\-_]+)/ })
    async handleStatusMethod(interaction: ButtonInteraction) {
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        // TODO: Generate and store a unique verification code for this user in the database
        const verificationCode = Math.random().toString(36).slice(2, 8).toUpperCase();
        await prisma.vRChatAccount.updateMany({
            where: { vrcUserId },
            data: { verificationCode }
        });
        const embed = new EmbedBuilder()
            .setTitle("Change Status to Verify")
            .setDescription(`To verify, change your VRChat status to the following code:\n\n**${verificationCode}**\n\nOnce you've changed your status, click **Verify status** below.`)
            .setColor(0xFEE75C);
        const verifyBtn = new ButtonBuilder()
            .setCustomId(`vrchat-status-verify:${discordId}:${vrcUserId}`)
            .setLabel("Verify status")
            .setStyle(ButtonStyle.Success);
            
        await interaction.reply({
            embeds: [embed],
            components: [{ type: 1, components: [verifyBtn] }],
            flags: MessageFlags.Ephemeral
        });
    }

    @ButtonComponent({ id: /vrchat-status-verify:(\d+):([a-zA-Z0-9\-_]+)/ })
    async handleStatusVerify(interaction: ButtonInteraction) {
        const parts = interaction.customId.split(":");
        const discordId = parts[1];
        const vrcUserId = parts[2];
        // Fetch the VRChatAccount to get the verification code
        const vrcAccount = await prisma.vRChatAccount.findFirst({ where: { vrcUserId } });
        if (!vrcAccount || !vrcAccount.verificationCode) {
            await interaction.reply({
                content: "No verification code found for this account. Please restart the verification process.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // Fetch the VRChat user info
        let userInfo: any = null;
        try {
            userInfo = await getUserById(vrcUserId);
        } catch (e) {
            userInfo = null;
        }
        if (!userInfo || !userInfo.statusDescription) {
            await interaction.reply({
                content: "Could not fetch VRChat user status. Please try again later.",
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        // Check if the statusDescription contains the verification code
        if (userInfo.statusDescription.includes(vrcAccount.verificationCode)) {
            // Mark as verified and wipe the code
            await prisma.vRChatAccount.update({
                where: { id: vrcAccount.id },
                data: { verified: true, verificationCode: null }
            });
            const embed = new EmbedBuilder()
                .setTitle("Verification Successful")
                .setDescription(`Your VRChat account (**${vrcUserId}**) has been successfully verified via status change!`)
                .setColor(0x57F287);
            await interaction.reply({
                embeds: [embed],
                flags: MessageFlags.Ephemeral
            });
        } else {
            await interaction.reply({
                content: "Verification failed. The code was not found in your VRChat status. Please make sure you have set your status correctly and try again.",
                flags: MessageFlags.Ephemeral
            });
        }
    }
}
