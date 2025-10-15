import {
  ApplicationCommandOptionType,
  CommandInteraction,
  EmbedBuilder,
  escapeMarkdown,
} from "discord.js";
import { Pagination } from "@discordx/pagination";
import { Discord, Slash, SlashGroup, SlashOption, Guard } from "discordx";
import { WhitelistManager } from "../../managers/whitelist/whitelistManager.js";
import { searchUsers } from "../../utility/vrchat/user.js";
import { DevGuardAndStaffGuard } from "../../utility/guards.js";

const whitelistManager = new WhitelistManager();

@Discord()
@SlashGroup({
  name: "whitelist",
  description: "VRChat whitelist management commands",
})
@SlashGroup("whitelist")
@Guard(DevGuardAndStaffGuard)
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
      description:
        "Whitelist permissions (comma-separated): station, truavatar, trudoor, forceAvatar, forceDoor",
      name: "permissions",
      required: true,
      type: ApplicationCommandOptionType.String,
    })
    permissions: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      const permissionList = permissions
        .split(",")
        .map((p) => p.trim())
        .filter((p) => p);

      if (permissionList.length === 0) {
        await interaction.reply({
          content: "❌ You must provide at least one permission.",
          ephemeral: true,
        });
        return;
      }

      // Check for permissions with non-unicode characters
      const invalidPermissions = permissionList.filter((p) => {
        // Check if the permission contains only unicode characters
        try {
          // This will throw if there are invalid unicode sequences
          const encoded = Buffer.from(p, "utf8").toString("utf8");
          return encoded !== p;
        } catch {
          return true; // Invalid if encoding fails
        }
      });

      if (invalidPermissions.length > 0) {
        await interaction.reply({
          content: `❌ Invalid permissions (contain non-unicode characters): ${invalidPermissions.join(", ")}`,
          ephemeral: true,
        });
        return;
      }

      await whitelistManager.setupDiscordRoleMapping(
        discordRole.id,
        interaction.guildId!,
        permissionList,
      );

      const embed = new EmbedBuilder()
        .setTitle("✅ Discord Role Mapping Created")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "Discord Role",
            value: `<@&${discordRole.id}>`,
            inline: true,
          },
          {
            name: "Permissions",
            value: permissionList.join(", "),
            inline: true,
          },
        )
        .setFooter({
          text: "Users with this role will automatically get these whitelist permissions",
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });

      // Trigger a resync for all members with this role
      const guild = interaction.guild;
      if (guild) {
        const allMembers = await guild.members.fetch();
        const membersWithRole = allMembers.filter((member) =>
          member.roles.cache.has(discordRole.id),
        );

        console.log(
          `[Whitelist] Triggering resync for ${membersWithRole.size} members with role ${discordRole.name}`,
        );

        for (const [, member] of membersWithRole) {
          try {
            const roleIds = member.roles.cache.map((role) => role.id);
            if (await whitelistManager.shouldUserBeWhitelisted(roleIds)) {
              await whitelistManager.syncUserRolesFromDiscord(
                member.id,
                roleIds,
                interaction.guildId!,
              );
            }
          } catch (error) {
            console.error(
              `[Whitelist] Error resyncing ${member.displayName}:`,
              error,
            );
          }
        }
        
        // Queue a single batched update after processing all members
        if (membersWithRole.size > 0) {
          const msg = `Role mapping updated for ${discordRole.name}: ${permissionList.join(", ")}`;
          whitelistManager.queueBatchedUpdate('bulk-role-setup', msg);
        }
      }
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to setup role mapping: ${error.message}`,
        ephemeral: true,
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
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      if (!interaction.guild) {
        await interaction.reply({
          content: "❌ This command can only be used in a server.",
          ephemeral: true,
        });
        return;
      }

      const success = await whitelistManager.deleteRole(interaction.guild.id, discordRole.id);

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
          const allMembers = await guild.members.fetch();
          const membersWithRole = allMembers.filter((member) =>
            member.roles.cache.has(discordRole.id),
          );

          console.log(
            `[Whitelist] Revalidating access for ${membersWithRole.size} members after removing role mapping for ${discordRole.name}`,
          );

          let accessUpdated = 0;
          let errors = 0;

          for (const [, member] of membersWithRole) {
            try {
              const roleIds = member.roles.cache.map((role) => role.id);

              // Get their current whitelist status
              const userBefore = await whitelistManager.getUserByDiscordId(
                member.id,
              );
              const hadAccessBefore = !!userBefore?.whitelistEntry;

              // Sync their roles (this will remove access if they no longer qualify)
              await whitelistManager.syncUserRolesFromDiscord(
                member.id,
                roleIds,
                interaction.guild!.id,
              );

              // Check their status after sync
              const userAfter = await whitelistManager.getUserByDiscordId(
                member.id,
              );
              const hasAccessAfter = !!userAfter?.whitelistEntry;

              if (hadAccessBefore !== hasAccessAfter) {
                accessUpdated++;
              }
            } catch (error) {
              console.error(
                `[Whitelist] Error revalidating access for ${member.displayName}:`,
                error,
              );
              errors++;
            }
          }

          console.log(
            `[Whitelist] Role removal revalidation complete: ${accessUpdated} access changed, ${errors} errors`,
          );
          
          // Queue a single batched update after processing all members
          if (accessUpdated > 0) {
            const msg = `Role mapping removed for ${discordRole.name}`;
            whitelistManager.queueBatchedUpdate('bulk-role-removal', msg);
          }
        }
      } else {
        await interaction.reply({
          content: `❌ Role mapping not found.`,
          ephemeral: true,
        });
      }
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to remove role mapping: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  @Slash({ description: "List all Discord role mappings" })
  async listroles(interaction: CommandInteraction): Promise<void> {
    try {
      const roleMappings = await whitelistManager.getDiscordRoleMappings();

      if (roleMappings.length === 0) {
        await interaction.reply({
          content: "❌ No Discord role mappings found.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 Discord Role Mappings")
        .setColor(0x0099ff);

      const roleList = roleMappings
        .map((role: any) => {
          const discordRole = role.discordRoleId
            ? `<@&${role.discordRoleId}>`
            : "Not linked";
          const permissions = role.permissions || "No permissions";
          return `**Role ID: ${role.id}**\nDiscord: ${discordRole}\nPermissions: ${permissions}\nGuild: ${role.guildId}`;
        })
        .join("\n\n");

      embed.setDescription(roleList);

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to list role mappings: ${error.message}`,
        ephemeral: true,
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
    interaction: CommandInteraction,
  ): Promise<void> {
    const targetUser = user || interaction.user;

    try {
      let userInfo: any;

      if (targetUser) {
        userInfo = await whitelistManager.getUserByDiscordId(targetUser.id);
      } else if (vrchatUsername) {
        const searchResults = await searchUsers({
          search: vrchatUsername.trim(),
          n: 1,
        });
        if (searchResults.length > 0) {
          userInfo = await whitelistManager.getUserByVrcUserId(
            searchResults[0].id,
          );
        }
      }

      if (!userInfo) {
        await interaction.reply({
          content: "❌ User not found in the system.",
          ephemeral: true,
        });
        return;
      }

      const embed = new EmbedBuilder()
        .setTitle("📋 User Whitelist Info")
        .setColor(0x0099ff);

      if (userInfo.discordId) {
        embed.addFields({
          name: "Discord User",
          value: `<@${userInfo.discordId}>`,
          inline: true,
        });
      }

      if (userInfo.vrchatAccount?.vrchatUsername) {
        embed.addFields({
          name: "VRChat Username",
          value: userInfo.vrchatAccount.vrchatUsername,
          inline: true,
        });
      }

      if (userInfo.whitelistEntry) {
        // Extract permissions from role assignments properly
        const allActivePermissions = new Set<string>();
        const allExpiredPermissions = new Set<string>();
        
        for (const assignment of userInfo.whitelistEntry.roleAssignments) {
          if (assignment.role.permissions) {
            const rolePermissions = assignment.role.permissions
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean);
            
            const isExpired = assignment.expiresAt && assignment.expiresAt <= new Date();
            if (isExpired) {
              rolePermissions.forEach((perm: string) => allExpiredPermissions.add(perm));
            } else {
              rolePermissions.forEach((perm: string) => allActivePermissions.add(perm));
            }
          }
        }
        
        const permissions = allActivePermissions.size > 0 
          ? Array.from(allActivePermissions).sort().join(", ")
          : "None";

        embed.addFields(
          { name: "Whitelist Status", value: "✅ Whitelisted", inline: true },
          { name: "Active Permissions", value: permissions, inline: true },
        );

        if (allExpiredPermissions.size > 0) {
          const expiredPermissions = Array.from(allExpiredPermissions).sort().join(", ");
          embed.addFields({
            name: "Expired Permissions",
            value: expiredPermissions,
            inline: true,
          });
        }
      } else {
        embed.addFields({
          name: "Whitelist Status",
          value: "❌ Not whitelisted",
          inline: true,
        });
      }

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to get user info: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  @Slash({
    description:
      "Manually sync a user's whitelist permissions from their Discord roles",
  })
  async syncuser(
    @SlashOption({
      description: "Discord user to sync",
      name: "user",
      required: true,
      type: ApplicationCommandOptionType.User,
    })
    user: any,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      const member = await interaction.guild?.members.fetch(user.id);
      if (!member) {
        await interaction.reply({
          content: "❌ User not found in this server.",
          ephemeral: true,
        });
        return;
      }

      const roleIds = member.roles.cache.map((role) => role.id);
      const shouldBeWhitelisted =
        await whitelistManager.shouldUserBeWhitelisted(roleIds);

      if (shouldBeWhitelisted) {
        await whitelistManager.syncUserRolesFromDiscord(
          user.id,
          roleIds,
          interaction.guild!.id,
        );

        const userInfo = await whitelistManager.getUserByDiscordId(user.id);
        
        // Extract permissions from role assignments properly
        const allPermissions = new Set<string>();
        for (const assignment of userInfo?.whitelistEntry?.roleAssignments || []) {
          if (assignment.role.permissions) {
            // Split comma-separated permissions and add to set
            const rolePermissions = assignment.role.permissions
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean);
            rolePermissions.forEach((perm: string) => allPermissions.add(perm));
          }
        }
        
        const permissions = allPermissions.size > 0 
          ? Array.from(allPermissions).sort().join(", ")
          : "None";

        const embed = new EmbedBuilder()
          .setTitle("✅ User Synced")
          .setColor(0x00ff00)
          .addFields(
            { name: "User", value: `<@${user.id}>`, inline: true },
            { name: "Permissions", value: permissions, inline: true },
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
      } else {
        await whitelistManager.removeUserFromWhitelistIfNoRoles(user.id);
        await interaction.reply({
          content: `❌ User <@${user.id}> has no Discord roles that map to whitelist permissions.`,
          ephemeral: true,
        });
      }
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to sync user: ${error.message}`,
        ephemeral: true,
      });
    }
  }



  @Slash({
    name: "users",
    description: "Browse whitelist users with VRChat links and whitelist roles",
  })
  async users(interaction: CommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();

      const whitelistEntries = await whitelistManager.getWhitelistUsers();

      if (whitelistEntries.length === 0) {
        await interaction.editReply({
          content: "❌ No users found in the whitelist.",
        });
        return;
      }

      const pageSize = 10;
      const totalPages = Math.ceil(whitelistEntries.length / pageSize);
      const pages: Array<{ embeds: EmbedBuilder[] }> = [];

      for (let i = 0; i < whitelistEntries.length; i += pageSize) {
        const chunk = whitelistEntries.slice(i, i + pageSize);
        const description = chunk
          .map((entry: any, index: number) => {
            const listIndex = i + index + 1;
            const mention = entry.discordId
              ? `<@${entry.discordId}>`
              : "Unknown Discord user";
            const vrchatDisplay = entry.vrchatUsername || "Unknown VRChat user";
            const vrcLink = entry.vrcUserId
              ? `https://vrchat.com/home/user/${encodeURIComponent(entry.vrcUserId)}`
              : null;
            const vrchatLine = vrcLink
              ? `[${vrchatDisplay}](${vrcLink})`
              : vrchatDisplay;
            const whitelistRoles: string = entry.roles?.length
              ? entry.roles
                  .map((role: string) => `\`${escapeMarkdown(role)}\``)
                  .join(", ")
              : "No whitelist permissions";

            return `**${listIndex}.** ${mention}\n• VRChat: ${vrchatLine}\n• Whitelist: ${whitelistRoles}`;
          })
          .join("\n\n");

        const embed = new EmbedBuilder()
          .setTitle("📋 Whitelist Users")
          .setColor(0x0099ff)
          .setDescription(description)
          .setFooter({
            text: `Page ${Math.floor(i / pageSize) + 1} of ${totalPages} • Total: ${whitelistEntries.length} users`,
          })
          .setTimestamp();

        pages.push({ embeds: [embed] });
      }

      if (pages.length === 1) {
        await interaction.editReply(pages[0]);
        return;
      }

      const pagination = new Pagination(interaction, pages, {
        time: 120_000,
      });

      await pagination.send();
    } catch (error: any) {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ Failed to list users: ${error.message}`,
        });
      } else {
        await interaction.reply({
          content: `❌ Failed to list users: ${error.message}`,
          ephemeral: true,
        });
      }
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
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      const user = await whitelistManager.getUserByDiscordId(discordUser.id);

      if (!user || !user.whitelistEntry) {
        await interaction.reply({
          content: `❌ User not found in whitelist.`,
          ephemeral: true,
        });
        return;
      }

      // Extract permissions properly with expiry info
      const activeRoles: string[] = [];
      for (const assignment of user.whitelistEntry?.roleAssignments || []) {
        if (!assignment.expiresAt || assignment.expiresAt > new Date()) {
          if (assignment.role.permissions) {
            const rolePermissions = assignment.role.permissions
              .split(',')
              .map((p: string) => p.trim())
              .filter(Boolean);
            
            const expiry = assignment.expiresAt
              ? ` (expires ${assignment.expiresAt.toDateString()})`
              : "";
            
            rolePermissions.forEach((perm: string) => {
              activeRoles.push(`${perm}${expiry}`);
            });
          }
        }
      }

      const vrchatAccounts =
        user.vrchatAccounts
          ?.map(
            (account: any) => `${account.vrcUserId} (${account.accountType})`,
          )
          ?.join("\n") || "No verified VRChat accounts";

      const embed = new EmbedBuilder()
        .setTitle("👤 User Information")
        .setColor(0x0099ff)
        .addFields(
          { name: "Discord User", value: `<@${user.discordId}>`, inline: true },
          { name: "VRChat Accounts", value: vrchatAccounts, inline: true },
          {
            name: "Added to Whitelist",
            value: user.whitelistEntry?.createdAt?.toDateString() || "Unknown",
            inline: true,
          },
          {
            name: "Active Roles",
            value:
              activeRoles.length > 0
                ? activeRoles.join("\n")
                : "No roles assigned",
          },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to get user info: ${error.message}`,
        ephemeral: true,
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
          {
            name: "Total Users",
            value: stats.totalUsers.toString(),
            inline: true,
          },
          {
            name: "Total Roles",
            value: stats.totalRoles.toString(),
            inline: true,
          },
          {
            name: "Active Assignments",
            value: stats.totalActiveAssignments.toString(),
            inline: true,
          },
          {
            name: "Expired Assignments",
            value: stats.totalExpiredAssignments.toString(),
            inline: true,
          },
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to get statistics: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  @Slash({ description: "Generate and download the encoded whitelist" })
  async generate(interaction: CommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();

      const [rawContent, encodedContent] = await Promise.all([
        whitelistManager.generateWhitelistContent(),
        whitelistManager.generateEncodedWhitelist(),
      ]);

      const stats = await whitelistManager.getStatistics();

      // Try to update the GitHub repository with the new whitelist
      let repoUpdateSuccess = false;
      let repoUpdateError = null;
      try {
        await whitelistManager.publishWhitelist(
          `manual generate: latest whitelist`,
          true, // Force update even if content unchanged
          interaction.guildId ?? undefined
        );
        repoUpdateSuccess = true;
      } catch (repoError: any) {
        repoUpdateError = repoError.message;
        console.warn("Failed to update GitHub repository:", repoError);
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Whitelist Generated")
        .setColor(0x00ff00)
        .addFields(
          {
            name: "Total Users",
            value: stats.totalUsers.toString(),
            inline: true,
          },
          {
            name: "Active Assignments",
            value: stats.totalActiveAssignments.toString(),
            inline: true,
          },
          {
            name: "Raw Content Size",
            value: `${rawContent.length} characters`,
            inline: true,
          },
          {
            name: "Encoded Size",
            value: `${encodedContent.length} characters`,
            inline: true,
          },
          {
            name: "GitHub Repository",
            value: repoUpdateSuccess
              ? "✅ Updated"
              : `❌ Failed: ${repoUpdateError}`,
            inline: true,
          },
          {
            name: "Cloudflare Cache",
            value: "✅ Purged",
            inline: true,
          },
        )
        .setDescription(
          "```\n" +
            rawContent.substring(0, 1000) +
            (rawContent.length > 1000 ? "...\n```" : "\n```"),
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({
        content: `❌ Failed to generate whitelist: ${error.message}`,
      });
    }
  }

  @Slash({ description: "Clean up expired role assignments" })
  async cleanup(interaction: CommandInteraction): Promise<void> {
    try {
      const cleanedCount = await whitelistManager.cleanupExpiredRoles();

      const embed = new EmbedBuilder()
        .setTitle("🧹 Cleanup Complete")
        .setColor(0x00ff00)
        .addFields({
          name: "Expired Assignments Removed",
          value: cleanedCount.toString(),
        })
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.reply({
        content: `❌ Failed to cleanup: ${error.message}`,
        ephemeral: true,
      });
    }
  }

  @Slash({
    description: "Update GitHub repository with current whitelist data",
  })
  async updaterepo(interaction: CommandInteraction): Promise<void> {
    try {
      await interaction.deferReply();

      await whitelistManager.publishWhitelist(
        `manual update: latest whitelist`,
        true, // Force update even if content unchanged
  interaction.guildId ?? undefined
      );

      const embed = new EmbedBuilder()
        .setTitle("📝 Repository Updated")
        .setColor(0x00ff00)
        .setDescription(
          "Successfully updated GitHub repository with current whitelist data",
        )
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error: any) {
      await interaction.editReply({
        content: `❌ Failed to update repository: ${error.message}`,
      });
    }
  }

  @Slash({
    description: "Validate and cleanup whitelist access for all server members",
  })
  async validateaccess(
    @SlashOption({
      description: "Specific Discord user to validate (optional)",
      name: "user",
      required: false,
      type: ApplicationCommandOptionType.User,
    })
    user: any,
    @SlashOption({
      description: "VRChat username to validate (optional)",
      name: "vrchat_username",
      required: false,
      type: ApplicationCommandOptionType.String,
    })
    vrchatUsername: string,
    interaction: CommandInteraction,
  ): Promise<void> {
    try {
      await interaction.deferReply();

      const guild = interaction.guild;
      if (!guild) {
        await interaction.editReply({
          content: "❌ This command can only be used in a server.",
        });
        return;
      }

      // Handle VRChat username lookup
      if (vrchatUsername && !user) {
        const searchResults = await searchUsers({
          search: vrchatUsername.trim(),
          n: 1,
        });

        if (searchResults.length === 0) {
          await interaction.editReply({
            content: `❌ No VRChat user found with username: ${vrchatUsername}`,
          });
          return;
        }

        const vrcUser = searchResults[0];
        const userInfo = await whitelistManager.getUserByVrcUserId(vrcUser.id);

        if (!userInfo) {
          await interaction.editReply({
            content: `❌ VRChat user **${vrcUser.displayName}** is not in the database.`,
          });
          return;
        }

        // Look up the Discord user from the database
        const discordUserId = userInfo.discordId;
        const member = await guild.members.fetch(discordUserId).catch(() => null);

        if (!member) {
          await interaction.editReply({
            content: `❌ VRChat user **${vrcUser.displayName}** (Discord: <@${discordUserId}>) is not in this server.`,
          });
          return;
        }

        // Validate this specific user
        const roleIds = member.roles.cache.map((role) => role.id);
        const userBefore = await whitelistManager.getUserByDiscordId(discordUserId);
        const hadAccessBefore = !!userBefore?.whitelistEntry;

        await whitelistManager.syncUserRolesFromDiscord(
          discordUserId,
          roleIds,
          guild.id,
        );

        const userAfter = await whitelistManager.getUserByDiscordId(discordUserId);
        const hasAccessAfter = !!userAfter?.whitelistEntry;
        const rolesAfter =
          userAfter?.whitelistEntry?.roleAssignments?.map((a) => a.role.discordRoleId || a.role.id) ||
          [];

        const embed = new EmbedBuilder()
          .setTitle("✅ User Access Validation Complete")
          .setColor(hasAccessAfter ? 0x00ff00 : 0xff0000)
          .addFields(
            { name: "VRChat Username", value: vrcUser.displayName, inline: true },
            { name: "Discord User", value: `<@${discordUserId}>`, inline: true },
            {
              name: "Has Access",
              value: hasAccessAfter ? "✅ Yes" : "❌ No",
              inline: true,
            },
            {
              name: "Changes Made",
              value: hadAccessBefore !== hasAccessAfter ? "✅ Yes" : "❌ No",
              inline: true,
            },
          )
          .setTimestamp();

        if (hasAccessAfter) {
          embed.addFields({
            name: "Current Roles",
            value: rolesAfter.join(", ") || "None",
            inline: false,
          });
        }

        await interaction.editReply({ embeds: [embed] });
        return;
      }

      if (user) {
        // Validate specific user
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) {
          await interaction.editReply({
            content: "❌ User not found in this server.",
          });
          return;
        }

        const roleIds = member.roles.cache.map((role) => role.id);

        // Get their current whitelist status
        const userBefore = await whitelistManager.getUserByDiscordId(user.id);
        const hadAccessBefore = !!userBefore?.whitelistEntry;

        // Sync their roles (this will add/remove access as needed)
        await whitelistManager.syncUserRolesFromDiscord(
          user.id,
          roleIds,
          guild.id,
        );

        // Check their status after sync
        const userAfter = await whitelistManager.getUserByDiscordId(user.id);
        const hasAccessAfter = !!userAfter?.whitelistEntry;
        const rolesAfter =
          userAfter?.whitelistEntry?.roleAssignments?.map((a) => a.role.discordRoleId || a.role.id) ||
          [];

        const embed = new EmbedBuilder()
          .setTitle("✅ User Access Validation Complete")
          .setColor(hasAccessAfter ? 0x00ff00 : 0xff0000)
          .addFields(
            { name: "User", value: `<@${user.id}>`, inline: true },
            {
              name: "Has Access",
              value: hasAccessAfter ? "✅ Yes" : "❌ No",
              inline: true,
            },
            {
              name: "Changes Made",
              value: hadAccessBefore !== hasAccessAfter ? "✅ Yes" : "❌ No",
              inline: true,
            },
          )
          .setTimestamp();

        if (hasAccessAfter) {
          embed.addFields({
            name: "Current Roles",
            value: rolesAfter.join(", ") || "None",
            inline: false,
          });
        }

        await interaction.editReply({ embeds: [embed] });
      } else {
        // Validate all members
        const members = await guild.members.fetch();
        let validated = 0;
        let accessGranted = 0;
        let accessRevoked = 0;
        let errors = 0;

        // Step 1: Validate all current guild members
        for (const [, member] of members) {
          try {
            const roleIds = member.roles.cache.map((role) => role.id);

            // Get their current whitelist status
            const userBefore = await whitelistManager.getUserByDiscordId(
              member.id,
            );
            const hadAccessBefore = !!userBefore?.whitelistEntry;

            // Sync their roles
            await whitelistManager.syncUserRolesFromDiscord(
              member.id,
              roleIds,
              guild.id,
            );

            // Check their status after sync
            const userAfter = await whitelistManager.getUserByDiscordId(
              member.id,
            );
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
            console.error(
              `[Whitelist] Error validating access for ${member.displayName}:`,
              error,
            );
            errors++;
          }
        }

        // Step 2: Check all whitelisted users and remove those not in the guild
        const whitelistedUsers = await whitelistManager.getWhitelistUsers();
        let usersNotInGuild = 0;

        for (const whitelistEntry of whitelistedUsers) {
          try {
            if (!whitelistEntry.discordId) continue;

            // Check if user is in the current guild members
            const isInGuild = members.has(whitelistEntry.discordId);

            if (!isInGuild) {
              // User has whitelist access but is not in the guild - remove them
              await whitelistManager.removeUserFromWhitelistIfNoRoles(
                whitelistEntry.discordId,
              );
              usersNotInGuild++;
              accessRevoked++;
              console.log(
                `[Whitelist] Removed ${whitelistEntry.vrchatUsername || whitelistEntry.discordId} - no longer in guild`,
              );
            }
          } catch (error) {
            console.error(
              `[Whitelist] Error checking guild membership for ${whitelistEntry.vrchatUsername || whitelistEntry.discordId}:`,
              error,
            );
            errors++;
          }
        }

        const embed = new EmbedBuilder()
          .setTitle("✅ Bulk Access Validation Complete")
          .setColor(0x00ff00)
          .addFields(
            {
              name: "Guild Members Validated",
              value: validated.toString(),
              inline: true,
            },
            {
              name: "Users Not in Guild (Removed)",
              value: usersNotInGuild.toString(),
              inline: true,
            },
            {
              name: "Access Granted",
              value: accessGranted.toString(),
              inline: true,
            },
            {
              name: "Access Revoked",
              value: accessRevoked.toString(),
              inline: true,
            },
            { name: "Errors", value: errors.toString(), inline: true },
          )
          .setDescription(
            `Validated ${validated} guild members and checked ${whitelistedUsers.length} whitelisted users for guild membership.`,
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Update GitHub repository if any changes were made
        if (accessGranted > 0 || accessRevoked > 0) {
          try {
            const msg = `Bulk validation: ${accessGranted} granted, ${accessRevoked} revoked`;
            whitelistManager.queueBatchedUpdate('bulk-validation', msg);
            console.log(
              `[Whitelist] Queued GitHub repository update after bulk validation`,
            );
          } catch (gistError) {
            console.warn(
              `[Whitelist] Failed to queue GitHub repository update after bulk validation:`,
              gistError,
            );
          }
        }
      }
    } catch (error: any) {
      await interaction.editReply({
        content: `❌ Failed to validate access: ${error.message}`,
      });
    }
  }
}
