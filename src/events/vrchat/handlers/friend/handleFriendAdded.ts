import { getUserById } from '../../../../utility/vrchat.js';
import { inviteUserToGroup, getGroupMember } from '../../../../utility/vrchat/groups.js';
import { whitelistManager } from '../../../../managers/whitelist/whitelistManager.js';
import { prisma, bot } from '../../../../main.js';
import { EmbedBuilder, Colors, ButtonBuilder, ButtonStyle, ActionRowBuilder } from 'discord.js';
import { sendWhitelistLog, getUserWhitelistRoles } from '../../../../utility/vrchat/whitelistLogger.js';

export async function handleFriendAdd(content: any) {
    // content should include the VRChat user ID of the new friend
    const vrcUserId = content.userId || content.id;
    if (!vrcUserId) {
        console.log('[Friend Add] No VRChat user ID found in event:', content);
        return;
    }
    // Find the VRChatAccount in the database (pending verification)
    const vrcAccount = await prisma.vRChatAccount.findFirst({
        where: { vrcUserId, accountType: { in: ["IN_VERIFICATION"] } },
    });
    if (!vrcAccount) {
        console.log('[Friend Add] No VRChatAccount found for VRChat user:', vrcUserId);
        return;
    }
    // Try to update the verified field and set verification status to VERIFIED
    let vrchatUsername: string | null = null;
    try {
        // Get VRChat username for caching
        try {
            const userInfo = await getUserById(vrcUserId);
            vrchatUsername = userInfo?.displayName || userInfo?.username;
        } catch (e) {
            console.warn(`Failed to fetch username for ${vrcUserId}:`, e);
        }

        // Determine account type based on whether user has a MAIN account
        const hasMainAccount = await prisma.vRChatAccount.findFirst({
            where: { userId: vrcAccount.userId, accountType: "MAIN" }
        });
        const finalAccountType = hasMainAccount ? "ALT" : "MAIN";

        await prisma.vRChatAccount.update({
            where: { id: vrcAccount.id },
            data: {
                accountType: finalAccountType,
                vrchatUsername,
                usernameUpdatedAt: new Date(),
                verificationGuildId: null, // Clear guild ID after verification is complete
            }
        });

        console.log(`[Friend Add] Account ${vrcUserId} successfully verified and marked as VERIFIED`);

        // Send DM confirmation to the user
        await sendDMConfirmation(vrcAccount.userId, vrcUserId, vrchatUsername);
    } catch (e) {
        console.log('[Friend Add] Could not update verification status:', e);
    }
    // Fetch the Discord user by userId and update whitelist
    const user = await prisma.user.findUnique({ where: { id: vrcAccount.userId, } });
    if (user && user.discordId) {
        console.log(`[Friend Add] VRChat account for Discord user: ${user.discordId}`);
        try {
            // For verified accounts, sync and publish with roles
            if (vrchatUsername) { // If username was fetched, it was verified
                await whitelistManager.syncAndPublishAfterVerification(user.discordId);
                
                // Send whitelist verification log to the guild where verification was started
                if (bot && bot.guilds && vrcAccount.verificationGuildId) {
                    try {
                        // Get the account type from the updated account
                        const updatedAccount = await prisma.vRChatAccount.findFirst({
                            where: { vrcUserId, userId: vrcAccount.userId }
                        });
                        
                        // Fetch the guild where verification was initiated
                        const guild = await bot.guilds.fetch(vrcAccount.verificationGuildId).catch(() => null);
                        if (guild) {
                            const member = await guild.members.fetch(user.discordId).catch(() => null);
                            if (member) {
                                const displayName = member.displayName || member.user?.username || user.discordId;
                                const whitelistRoles = await getUserWhitelistRoles(user.discordId);
                                
                                await sendWhitelistLog(bot, guild.id, {
                                    discordId: user.discordId,
                                    displayName,
                                    vrchatUsername,
                                    vrcUserId,
                                    roles: whitelistRoles,
                                    action: "verified",
                                    accountType: updatedAccount?.accountType,
                                });
                            }
                        }
                    } catch (logError) {
                        console.warn(`[Friend Add] Failed to send whitelist log for ${user.discordId}:`, logError);
                    }
                }
            } else {
                // For unverified binding, ensure basic access and sync if eligible
                await whitelistManager.ensureUnverifiedAccountAccess(user.discordId);
            }
        } catch (e) {
            console.warn(`[Friend Add] Failed to update whitelist for user ${user.discordId}:`, e);
        }
        // Optionally, send a Discord notification here
    }
}

/**
 * Sends a DM confirmation to the user when their VRChat account is verified automatically
 */
async function sendDMConfirmation(userId: number, vrcUserId: string, vrchatUsername: string | null) {
    try {
        // Get the user from database to get their Discord ID
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user?.discordId) {
            console.warn('[DM Confirmation] No Discord ID found for user:', userId);
            return;
        }

        // Try to send a DM to the user
        try {
            const discordUser = await bot.users.fetch(user.discordId);
            
            const embed = new EmbedBuilder()
                .setTitle("✅ VRChat Verification Complete!")
                .setDescription(`Your VRChat account has been successfully verified!\n\n**Account:** ${vrchatUsername || vrcUserId}\n**Method:** Friend Request\n\nYour account is now fully verified and protected from takeover. You now have access to all whitelisted worlds!`)
                .setColor(Colors.Green)
                .setFooter({ text: "S.H.I.E.L.D. Bot - Verification System" })
                .setTimestamp();

            // Check if there's a VRChat group configured for any guild
            const guildSettings = await prisma.guildSettings.findFirst({
                where: { vrcGroupId: { not: null } },
            });

            const components: any[] = [];
            if (guildSettings?.vrcGroupId) {
                // Check if user is already in the group
                let isInGroup = false;
                let hasOnlyDefaultRole = false;
                
                try {
                    const groupMember = await getGroupMember(guildSettings.vrcGroupId, vrcUserId);
                    if (groupMember) {
                        isInGroup = true;
                        // Check if they only have the default/everyone role (0 or 1 role total)
                        const totalRoles = [
                            ...(groupMember.roleIds || []),
                            ...(groupMember.mRoleIds || []),
                        ].length;
                        // If they have 1 or fewer roles, they likely only have the default role
                        hasOnlyDefaultRole = totalRoles <= 1;
                    }
                } catch (error) {
                    // User is not in group or error checking - treat as not in group
                    console.debug(`[DM Confirmation] Could not check group membership for ${vrcUserId}:`, error);
                }

                if (isInGroup) {
                    if (hasOnlyDefaultRole) {
                        // User is in group but only has default role - prompt to sync
                        const syncRolesButton = new ButtonBuilder()
                            .setCustomId(`grp-sync:${user.discordId}:${vrcUserId}`)
                            .setLabel("Sync Roles")
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji("🔄");

                        components.push(
                            new ActionRowBuilder().addComponents(syncRolesButton)
                        );

                        const currentDescription = embed.data.description || "";
                        const additionalText = `\n\n**SHIELD VRChat Group**\n✅ You're already in the group!\n• Click **Sync Roles** to update your VRChat group roles based on your Discord roles`;
                        const newDescription = currentDescription + additionalText;
                        
                        if (newDescription.length <= 4096) {
                            embed.setDescription(newDescription);
                        }
                    } else {
                        // User is in group and has roles - just show sync option
                        const syncRolesButton = new ButtonBuilder()
                            .setCustomId(`grp-sync:${user.discordId}:${vrcUserId}`)
                            .setLabel("Sync Roles")
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji("🔄");

                        components.push(
                            new ActionRowBuilder().addComponents(syncRolesButton)
                        );

                        const currentDescription = embed.data.description || "";
                        const additionalText = `\n\n**SHIELD VRChat Group**\n✅ You're already in the group!\n• Click **Sync Roles** to update your VRChat group roles based on your Discord roles`;
                        const newDescription = currentDescription + additionalText;
                        
                        if (newDescription.length <= 4096) {
                            embed.setDescription(newDescription);
                        }
                    }
                } else {
                    // User is not in group - show invite button
                    const joinGroupButton = new ButtonBuilder()
                        .setCustomId(`grp-inv:${user.discordId}:${vrcUserId}`)
                        .setLabel("Join Group")
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("🛡️");

                    // Format: grp-sync:{discordId}:{vrcUserId}
                    const syncRolesButton = new ButtonBuilder()
                        .setCustomId(`grp-sync:${user.discordId}:${vrcUserId}`)
                        .setLabel("Sync Roles")
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji("🔄");

                    components.push(
                        new ActionRowBuilder().addComponents(joinGroupButton, syncRolesButton)
                    );

                    const currentDescription = embed.data.description || "";
                    const additionalText = `\n\n**SHIELD VRChat Group**\n• Click **Join Group** to receive an invite\n• Click **Sync Roles** to update your VRChat group roles based on your Discord roles`;
                    const newDescription = currentDescription + additionalText;
                    
                    // Ensure we don't exceed Discord's 4096 character limit for embed descriptions
                    if (newDescription.length <= 4096) {
                        embed.setDescription(newDescription);
                    }
                }
            }

            await discordUser.send({ 
                embeds: [embed],
                components: components.length > 0 ? components : undefined,
            });
            console.log(`[DM Confirmation] Successfully sent verification confirmation DM to ${user.discordId}`);
        } catch (dmError: any) {
            // If DM fails (user has DMs disabled, etc.), log but don't throw
            console.warn(`[DM Confirmation] Failed to send DM to ${user.discordId}:`, dmError.message || dmError);
        }
    } catch (error) {
        console.error('[DM Confirmation] Error in sendDMConfirmation:', error);
    }
}
