import { ApplicationCommandOptionType, CommandInteraction, EmbedBuilder, PermissionFlagsBits, AttachmentBuilder, ApplicationIntegrationType, InteractionContextType } from "discord.js";
import { Discord, Slash, SlashGroup, SlashOption } from "discordx";
import { WhitelistManager } from "../../managers/whitelist/whitelistManager.js";

const whitelistManager = new WhitelistManager();

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [InteractionContextType.Guild, InteractionContextType.PrivateChannel],
  integrationTypes: [ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall]
})
@SlashGroup({
  name: "whitelist",
  description: "VRChat whitelist management commands",
  root: "vrchat"
})
@SlashGroup("whitelist", "vrchat")
export class WhitelistCommands {

  @Slash({ description: "Setup Discord role mapping to whitelist permissions" })
  async setuprole(
    @SlashOption({
      description: "Discord role to map",
      name: "discord_role",
      required: true,
      type: ApplicationCommandOptionType.Role,
    })
    discordRole: any,
    @SlashOption({
      description: "Whitelist permissions (comma-separated): station, truavatar, trudoor, forceAvatar, forceDoor",
      name: "permissions",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    permissions: string,
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to manage the whitelist.", ephemeral: true });
      return;
    }

    try {
      const permissionList = permissions.split(',').map(p => p.trim()).filter(p => p);
      
      if (permissionList.length === 0) {
        await interaction.reply({ 
          content: "❌ You must provide at least one permission.", 
          ephemeral: true 
        });
        return;
      }

      // Check for permissions with non-unicode characters
      const invalidPermissions = permissionList.filter(p => {
        // Check if the permission contains only unicode characters
        try {
          // This will throw if there are invalid unicode sequences
          const encoded = Buffer.from(p, 'utf8').toString('utf8');
          return encoded !== p;
        } catch {
          return true; // Invalid if encoding fails
        }
      });
      
      if (invalidPermissions.length > 0) {
        await interaction.reply({ 
          content: `❌ Invalid permissions (contain non-unicode characters): ${invalidPermissions.join(', ')}`, 
          ephemeral: true 
        });
        return;
      }

      await whitelistManager.setupDiscordRoleMapping(discordRole.id, discordRole.name, permissionList);
      
      const embed = new EmbedBuilder()
        .setTitle("✅ Discord Role Mapping Created")
        .setColor(0x00ff00)
        .addFields(
          { name: "Discord Role", value: `<@&${discordRole.id}>`, inline: true },
          { name: "Permissions", value: permissionList.join(', '), inline: true }
        )
        .setFooter({ text: "Users with this role will automatically get these whitelist permissions" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Trigger a resync for all members with this role
      const guild = interaction.guild;
      if (guild) {
        const membersWithRole = guild.members.cache.filter(member => 
          member.roles.cache.has(discordRole.id)
        );
        
        console.log(`[Whitelist] Triggering resync for ${membersWithRole.size} members with role ${discordRole.name}`);
        
        for (const [, member] of membersWithRole) {
          try {
            const roleIds = member.roles.cache.map(role => role.id);
            if (await whitelistManager.shouldUserBeWhitelisted(roleIds)) {
              await whitelistManager.syncUserRolesFromDiscord(member.id, roleIds);
            }
          } catch (error) {
            console.error(`[Whitelist] Error resyncing ${member.displayName}:`, error);
          }
        }
      }
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to setup role mapping: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Remove Discord role mapping" })
  async removerole(
    @SlashOption({
      description: "Discord role to remove from whitelist",
      name: "discord_role",
      required: true,
      type: ApplicationCommandOptionType.Role,
    })
    discordRole: any,
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to manage the whitelist.", ephemeral: true });
      return;
    }

    try {
      const success = await whitelistManager.deleteRole(discordRole.name);
      
      if (success) {
        const embed = new EmbedBuilder()
          .setTitle("✅ Role Mapping Removed")
          .setColor(0xff0000)
          .addFields({ name: "Discord Role", value: `<@&${discordRole.id}>` })
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        // Trigger a resync for all members who had this role
        const guild = interaction.guild;
        if (guild) {
          const membersWithRole = guild.members.cache.filter(member => 
            member.roles.cache.has(discordRole.id)
          );
          
          console.log(`[Whitelist] Revalidating access for ${membersWithRole.size} members after removing role mapping for ${discordRole.name}`);
          
          let accessUpdated = 0;
          let errors = 0;
          
          for (const [, member] of membersWithRole) {
            try {
              const roleIds = member.roles.cache.map(role => role.id);
              
              // Get their current whitelist status
              const userBefore = await whitelistManager.getUserByDiscordId(member.id);
              const hadAccessBefore = !!userBefore?.whitelistEntry;
              
              // Sync their roles (this will remove access if they no longer qualify)
              await whitelistManager.syncUserRolesFromDiscord(member.id, roleIds);
              
              // Check their status after sync
              const userAfter = await whitelistManager.getUserByDiscordId(member.id);
              const hasAccessAfter = !!userAfter?.whitelistEntry;
              
              if (hadAccessBefore !== hasAccessAfter) {
                accessUpdated++;
              }
            } catch (error) {
              console.error(`[Whitelist] Error revalidating access for ${member.displayName}:`, error);
              errors++;
            }
          }
          
          console.log(`[Whitelist] Role removal revalidation complete: ${accessUpdated} access changed, ${errors} errors`);
        }
      } else {
        await interaction.reply({ 
          content: `❌ Role mapping not found.`, 
          ephemeral: true 
        });
      }
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to remove role mapping: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "List all Discord role mappings" })
  async listroles(interaction: CommandInteraction): Promise<void> {
    try {
      const roleMappings = await whitelistManager.getDiscordRoleMappings();
      
      if (roleMappings.length === 0) {
        await interaction.reply({ content: "❌ No Discord role mappings found.", ephemeral: true });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Discord Role Mappings")
        .setColor(0x0099ff);

      const roleList = roleMappings.map((role: any) => {
        const discordRole = role.discordRoleId ? `<@&${role.discordRoleId}>` : 'Not linked';
        const permissions = role.description || 'No permissions';
        return `**${role.name}**\nDiscord: ${discordRole}\nPermissions: ${permissions}`;
      }).join('\n\n');

      embed.setDescription(roleList);

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to list role mappings: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Get info about a user's whitelist status" })
  async info(
    @SlashOption({
      description: "Discord user to check",
      name: "user",
      required: false,
      type: ApplicationCommandOptionType.User,
    })
    user: any,
    @SlashOption({
      description: "VRChat username to check",
      name: "vrchat_username",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    vrchatUsername: string,
    interaction: CommandInteraction
  ): Promise<void> {
    const targetUser = user || interaction.user;
    
    try {
      let userInfo: any;
      
      if (targetUser) {
        userInfo = await whitelistManager.getUserByDiscordId(targetUser.id);
      } else if (vrchatUsername) {
        const { searchUsers } = await import('../../utility/vrchat/user.js');
        const searchResults = await searchUsers({ search: vrchatUsername.trim(), n: 1 });
        if (searchResults.length > 0) {
          userInfo = await whitelistManager.getUserByVrcUserId(searchResults[0].id);
        }
      }

      if (!userInfo) {
        await interaction.reply({ 
          content: "❌ User not found in the system.", 
          ephemeral: true 
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 User Whitelist Info")
        .setColor(0x0099ff);

      if (userInfo.discordId) {
        embed.addFields({ name: "Discord User", value: `<@${userInfo.discordId}>`, inline: true });
      }

      if (userInfo.vrchatAccount?.vrchatUsername) {
        embed.addFields({ name: "VRChat Username", value: userInfo.vrchatAccount.vrchatUsername, inline: true });
      }

      if (userInfo.whitelistEntry) {
        const permissions = userInfo.whitelistEntry.roleAssignments
          .filter((assignment: any) => !assignment.expiresAt || assignment.expiresAt > new Date())
          .map((assignment: any) => assignment.role.name)
          .join(', ') || 'None';
        
        embed.addFields(
          { name: "Whitelist Status", value: "✅ Whitelisted", inline: true },
          { name: "Active Permissions", value: permissions, inline: true }
        );

        const expiredRoles = userInfo.whitelistEntry.roleAssignments
          .filter((assignment: any) => assignment.expiresAt && assignment.expiresAt <= new Date())
          .map((assignment: any) => assignment.role.name);
        
        if (expiredRoles.length > 0) {
          embed.addFields({ name: "Expired Permissions", value: expiredRoles.join(', '), inline: true });
        }
      } else {
        embed.addFields({ name: "Whitelist Status", value: "❌ Not whitelisted", inline: true });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to get user info: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Manually sync a user's whitelist permissions from their Discord roles" })
  async syncuser(
    @SlashOption({
      description: "Discord user to sync",
      name: "user",
      required: true,
      type: ApplicationCommandOptionType.User,
    })
    user: any,
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to manage the whitelist.", ephemeral: true });
      return;
    }

    try {
      const member = await interaction.guild?.members.fetch(user.id);
      if (!member) {
        await interaction.reply({ 
          content: "❌ User not found in this server.", 
          ephemeral: true 
        });
        return;
      }

      const roleIds = member.roles.cache.map(role => role.id);
      const shouldBeWhitelisted = await whitelistManager.shouldUserBeWhitelisted(roleIds);
      
      if (shouldBeWhitelisted) {
        await whitelistManager.syncUserRolesFromDiscord(user.id, roleIds);
        
        const userInfo = await whitelistManager.getUserByDiscordId(user.id);
        const permissions = userInfo?.whitelistEntry?.roleAssignments
          ?.map((assignment: any) => assignment.role.name)
          ?.join(', ') || 'None';

        const embed = new EmbedBuilder()
          .setTitle("✅ User Synced")
          .setColor(0x00ff00)
          .addFields(
            { name: "User", value: `<@${user.id}>`, inline: true },
            { name: "Permissions", value: permissions, inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await whitelistManager.removeUserFromWhitelistIfNoRoles(user.id);
        await interaction.reply({ 
          content: `❌ User <@${user.id}> has no Discord roles that map to whitelist permissions.`, 
          ephemeral: true 
        });
      }
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to sync user: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "List all users in the whitelist" })
  async listusers(interaction: CommandInteraction): Promise<void> {
    try {
      const whitelistEntries = await whitelistManager.getWhitelistUsers();
      
      if (whitelistEntries.length === 0) {
        await interaction.reply({ content: "❌ No users found in the whitelist.", ephemeral: true });
        return;
      }

      const chunks = [];
      for (let i = 0; i < whitelistEntries.length; i += 10) {
        chunks.push(whitelistEntries.slice(i, i + 10));
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Whitelist Users")
        .setColor(0x0099ff)
        .setFooter({ text: `Page 1 of ${chunks.length} • Total: ${whitelistEntries.length} users` });

      const userList = chunks[0].map((entry: any) => {
        const roles = entry.roles.join(', ') || 'No roles';
        return `**${entry.vrchatUsername}**\nRoles: ${roles}`;
      }).join('\n\n');

      embed.setDescription(userList);

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to list users: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Get information about a specific user" })
  async userinfo(
    @SlashOption({
      description: "Discord user",
      name: "discord_user",
      required: true,
      type: ApplicationCommandOptionType.User,
    })
    discordUser: any,
    interaction: CommandInteraction
  ): Promise<void> {
    try {
      const user = await whitelistManager.getUserByDiscordId(discordUser.id);
      
      if (!user || !user.whitelistEntry) {
        await interaction.reply({ 
          content: `❌ User not found in whitelist.`, 
          ephemeral: true 
        });
        return;
      }

      const activeRoles = user.whitelistEntry?.roleAssignments
        ?.filter((assignment: any) => !assignment.expiresAt || assignment.expiresAt > new Date())
        ?.map((assignment: any) => {
          const expiry = assignment.expiresAt ? ` (expires ${assignment.expiresAt.toDateString()})` : '';
          return `${assignment.role.name}${expiry}`;
        }) || [];

      const vrchatAccounts = user.vrchatAccounts?.map((account: any) => 
        `${account.vrcUserId} (${account.accountType})`
      )?.join('\n') || 'No verified VRChat accounts';

      const embed = new EmbedBuilder()
        .setTitle("👤 User Information")
        .setColor(0x0099ff)
        .addFields(
          { name: "Discord User", value: `<@${user.discordId}>`, inline: true },
          { name: "VRChat Accounts", value: vrchatAccounts, inline: true },
          { name: "Added to Whitelist", value: user.whitelistEntry?.createdAt?.toDateString() || 'Unknown', inline: true },
          { name: "Active Roles", value: activeRoles.length > 0 ? activeRoles.join('\n') : "No roles assigned" }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to get user info: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Get whitelist statistics" })
  async stats(interaction: CommandInteraction): Promise<void> {
    try {
      const stats = await whitelistManager.getStatistics();
      
      const embed = new EmbedBuilder()
        .setTitle("📊 Whitelist Statistics")
        .setColor(0x0099ff)
        .addFields(
          { name: "Total Users", value: stats.totalUsers.toString(), inline: true },
          { name: "Total Roles", value: stats.totalRoles.toString(), inline: true },
          { name: "Active Assignments", value: stats.totalActiveAssignments.toString(), inline: true },
          { name: "Expired Assignments", value: stats.totalExpiredAssignments.toString(), inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to get statistics: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Generate and download the encoded whitelist" })
  async generate(interaction: CommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to generate the whitelist.", ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();

      const [rawContent, encodedContent] = await Promise.all([
        whitelistManager.generateWhitelistContent(),
        whitelistManager.generateEncodedWhitelist()
      ]);

      const stats = await whitelistManager.getStatistics();

      // Try to update the GitHub Gist with the new whitelist
      let gistUpdateSuccess = false;
      let gistUpdateError = null;
      try {
        await whitelistManager.updateGistWithWhitelist();
        gistUpdateSuccess = true;
      } catch (gistError: any) {
        gistUpdateError = gistError.message;
        console.warn('Failed to update GitHub Gist:', gistError);
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Whitelist Generated")
        .setColor(0x00ff00)
        .addFields(
          { name: "Total Users", value: stats.totalUsers.toString(), inline: true },
          { name: "Active Assignments", value: stats.totalActiveAssignments.toString(), inline: true },
          { name: "Raw Content Size", value: `${rawContent.length} characters`, inline: true },
          { name: "Encoded Size", value: `${encodedContent.length} characters`, inline: true },
          { 
            name: "GitHub Gist", 
            value: gistUpdateSuccess ? "✅ Updated" : `❌ Failed: ${gistUpdateError}`, 
            inline: true 
          }
        )
        .setDescription("```\n" + rawContent.substring(0, 1000) + (rawContent.length > 1000 ? "...\n```" : "\n```"))
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({ 
        content: `❌ Failed to generate whitelist: ${error.message}`
      });
    }
  }

  @Slash({ description: "Clean up expired role assignments" })
  async cleanup(interaction: CommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to clean up the whitelist.", ephemeral: true });
      return;
    }

    try {
      const cleanedCount = await whitelistManager.cleanupExpiredRoles();
      
      const embed = new EmbedBuilder()
        .setTitle("🧹 Cleanup Complete")
        .setColor(0x00ff00)
        .addFields({ name: "Expired Assignments Removed", value: cleanedCount.toString() })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({ 
        content: `❌ Failed to cleanup: ${error.message}`, 
        ephemeral: true 
      });
    }
  }

  @Slash({ description: "Update GitHub Gist with current whitelist data" })
  async updategist(interaction: CommandInteraction): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to update the gist.", ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();
      
      await whitelistManager.updateGistWithWhitelist();
      
      const embed = new EmbedBuilder()
        .setTitle("📝 Gist Updated")
        .setColor(0x00ff00)
        .setDescription("Successfully updated GitHub Gist with current whitelist data")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({ 
        content: `❌ Failed to update gist: ${error.message}`
      });
    }
  }

  @Slash({ description: "Validate and cleanup whitelist access for all server members" })
  async validateaccess(
    @SlashOption({
      description: "Specific user to validate (optional)",
      name: "user",
      required: false,
      type: ApplicationCommandOptionType.User,
    })
    user: any,
    interaction: CommandInteraction
  ): Promise<void> {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageRoles)) {
      await interaction.reply({ content: "You don't have permission to manage the whitelist.", ephemeral: true });
      return;
    }

    try {
      await interaction.deferReply();
      
      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({ content: "❌ This command can only be used in a server." });
        return;
      }

      if (user) {
        // Validate specific user
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          await interaction.editReply({ content: "❌ User not found in this server." });
          return;
        }
        
        const roleIds = member.roles.cache.map(role => role.id);
        
        // Get their current whitelist status
        const userBefore = await whitelistManager.getUserByDiscordId(user.id);
        const hadAccessBefore = !!userBefore?.whitelistEntry;
        
        // Sync their roles (this will add/remove access as needed)
        await whitelistManager.syncUserRolesFromDiscord(user.id, roleIds);
        
        // Check their status after sync
        const userAfter = await whitelistManager.getUserByDiscordId(user.id);
        const hasAccessAfter = !!userAfter?.whitelistEntry;
        const rolesAfter = userAfter?.whitelistEntry?.roleAssignments?.map(a => a.role.name) || [];
        
        const embed = new EmbedBuilder()
          .setTitle("✅ User Access Validation Complete")
          .setColor(hasAccessAfter ? 0x00ff00 : 0xff0000)
          .addFields(
            { name: "User", value: `<@${user.id}>`, inline: true },
            { name: "Has Access", value: hasAccessAfter ? "✅ Yes" : "❌ No", inline: true },
            { name: "Changes Made", value: hadAccessBefore !== hasAccessAfter ? "✅ Yes" : "❌ No", inline: true }
          )
          .setTimestamp();

        if (hasAccessAfter) {
          embed.addFields({ name: "Current Roles", value: rolesAfter.join(', ') || 'None', inline: false });
        }

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Validate all members
        const members = await guild.members.fetch();
        let validated = 0;
        let accessGranted = 0;
        let accessRevoked = 0;
        let errors = 0;

        for (const [, member] of members) {
          try {
            const roleIds = member.roles.cache.map(role => role.id);
            
            // Get their current whitelist status
            const userBefore = await whitelistManager.getUserByDiscordId(member.id);
            const hadAccessBefore = !!userBefore?.whitelistEntry;
            
            // Sync their roles
            await whitelistManager.syncUserRolesFromDiscord(member.id, roleIds);
            
            // Check their status after sync
            const userAfter = await whitelistManager.getUserByDiscordId(member.id);
            const hasAccessAfter = !!userAfter?.whitelistEntry;
            
            validated++;
            
            if (hadAccessBefore !== hasAccessAfter) {
              if (hasAccessAfter) {
                accessGranted++;
              } else {
                accessRevoked++;
              }
            }
          } catch (error) {
            console.error(`[Whitelist] Error validating access for ${member.displayName}:`, error);
            errors++;
          }
        }
        
        const embed = new EmbedBuilder()
          .setTitle("✅ Bulk Access Validation Complete")
          .setColor(0x00ff00)
          .addFields(
            { name: "Users Validated", value: validated.toString(), inline: true },
            { name: "Access Granted", value: accessGranted.toString(), inline: true },
            { name: "Access Revoked", value: accessRevoked.toString(), inline: true },
            { name: "Errors", value: errors.toString(), inline: true }
          )
          .setDescription(`Validated whitelist access for ${validated} server members.`)
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        
        // Update GitHub Gist if any changes were made
        if (accessGranted > 0 || accessRevoked > 0) {
          try {
            await whitelistManager.updateGistWithWhitelist();
            console.log(`[Whitelist] GitHub Gist updated after bulk validation`);
          } catch (gistError) {
            console.warn(`[Whitelist] Failed to update GitHub Gist after bulk validation:`, gistError);
          }
        }
      }
    } catch (error: any) {
      await interaction.editReply({ 
        content: `❌ Failed to validate access: ${error.message}`
      });
    }
  }
}
