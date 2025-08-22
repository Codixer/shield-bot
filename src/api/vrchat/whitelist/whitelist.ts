import { Get, Post, Delete, Router } from "@discordx/koa";
import { Context } from "koa";
import { WhitelistManager } from "../../../managers/whitelist/whitelistManager.js";
import { prisma } from "../../../main.js";

const whitelistManager = new WhitelistManager();

@Router()
export class WhitelistAPI {

  // Get encoded whitelist (for VRChat clients)
  @Get("/api/vrchat/whitelist/encoded")
  async getEncodedWhitelist(ctx: Context) {
    try {
      const encodedWhitelist = await whitelistManager.generateEncodedWhitelist();
      
      ctx.body = {
        success: true,
        data: encodedWhitelist
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Get raw whitelist content
  @Get("/api/vrchat/whitelist/raw")
  async getRawWhitelist(ctx: Context) {
    try {
      const content = await whitelistManager.generateWhitelistContent();
      
      ctx.body = {
        success: true,
        data: content
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Download whitelist as file
  @Get("/api/vrchat/whitelist/download")
  async downloadWhitelist(ctx: Context) {
    try {
      const format = ctx.query.format as string || 'encoded';
      const xorKey = ctx.query.key as string;
      
      let content: string;
      let filename: string;
      let contentType: string;

      if (format === 'raw') {
        content = await whitelistManager.generateWhitelistContent();
        filename = 'whitelist.csv';
        contentType = 'text/csv';
      } else {
        content = await whitelistManager.generateEncodedWhitelist();
        filename = 'whitelist.txt';
        contentType = 'text/plain';
      }

      ctx.set('Content-Disposition', `attachment; filename="${filename}"`);
      ctx.set('Content-Type', contentType);
      ctx.body = content;
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Get all users
  @Get("/api/vrchat/whitelist/users")
  async getAllUsers(ctx: Context) {
    try {
      const entries = await whitelistManager.getWhitelistUsers();
      
      ctx.body = {
        success: true,
        data: entries
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Get all roles
  @Get("/api/vrchat/whitelist/roles")
  async getAllRoles(ctx: Context) {
    try {
      const roles = await whitelistManager.getAllRoles();
      
      ctx.body = {
        success: true,
        data: roles
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Add user
  @Post("/api/vrchat/whitelist/users")
  async addUser(ctx: Context) {
    try {
      const { discordId, vrcUserId, vrchatUsername } = ctx.request.body as any;
      
      let user;
      if (discordId) {
        user = await whitelistManager.addUserByDiscordId(discordId);
      } else if (vrcUserId) {
        user = await whitelistManager.addUserByVrcUserId(vrcUserId);
      } else if (vrchatUsername) {
        user = await whitelistManager.addUserByVrcUsername(vrchatUsername);
      } else {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: "discordId, vrcUserId, or vrchatUsername is required"
        };
        return;
      }
      
      ctx.body = {
        success: true,
        data: user
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Remove user
  @Delete("/api/vrchat/whitelist/users/:username")
  async removeUser(ctx: Context) {
    try {
      const { username } = ctx.params;
      // Try to remove by VRChat username first, then by Discord ID
      let success = false;
      
      // Check if it's a Discord ID (snowflake pattern)
      if (/^\d{17,19}$/.test(username)) {
        success = await whitelistManager.removeUserByDiscordId(username);
      } else {
        // Try as VRChat User ID first, then as username
        if (username.startsWith('usr_')) {
          success = await whitelistManager.removeUserByVrcUserId(username);
        } else {
          // Search for VRChat user by username and remove
          try {
            const { searchUsers } = await import('../../../utility/vrchat/user.js');
            const searchResults = await searchUsers({ search: username, n: 1 });
            if (searchResults.length > 0) {
              success = await whitelistManager.removeUserByVrcUserId(searchResults[0].id);
            }
          } catch (error) {
            success = false;
          }
        }
      }
      
      if (!success) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: "User not found"
        };
        return;
      }

      ctx.body = {
        success: true,
        message: "User removed successfully"
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Create role
  @Post("/api/vrchat/whitelist/roles")
  async createRole(ctx: Context) {
    try {
      const { name, description, discordRoleId } = ctx.request.body as any;
      
      if (!name) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: "Role name is required"
        };
        return;
      }

      const role = await whitelistManager.createRole(name, description, discordRoleId);
      
      ctx.body = {
        success: true,
        data: role
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Delete role
  @Delete("/api/vrchat/whitelist/roles/:roleName")
  async deleteRole(ctx: Context) {
    try {
      const { roleName } = ctx.params;
      const success = await whitelistManager.deleteRole(roleName);
      
      if (!success) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: "Role not found"
        };
        return;
      }

      ctx.body = {
        success: true,
        message: "Role deleted successfully"
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Assign role to user
  @Post("/api/vrchat/whitelist/users/:username/roles")
  async assignRole(ctx: Context) {
    try {
      const { username } = ctx.params;
      const { roleName, assignedBy, expiresAt } = ctx.request.body as any;
      
      if (!roleName) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: "roleName is required"
        };
        return;
      }

      let assignment;
      
      // Check if it's a Discord ID (snowflake pattern)
      if (/^\d{17,19}$/.test(username)) {
        assignment = await whitelistManager.assignRoleByDiscordId(
          username, 
          roleName, 
          assignedBy, 
          expiresAt ? new Date(expiresAt) : undefined
        );
      } else {
        // Try as VRChat User ID first, then as username
        if (username.startsWith('usr_')) {
          assignment = await whitelistManager.assignRoleByVrcUserId(
            username, 
            roleName, 
            assignedBy, 
            expiresAt ? new Date(expiresAt) : undefined
          );
        } else {
          // Search for VRChat user by username and assign
          const { searchUsers } = await import('../../../utility/vrchat/user.js');
          const searchResults = await searchUsers({ search: username, n: 1 });
          if (searchResults.length > 0) {
            assignment = await whitelistManager.assignRoleByVrcUserId(
              searchResults[0].id, 
              roleName, 
              assignedBy, 
              expiresAt ? new Date(expiresAt) : undefined
            );
          } else {
            throw new Error(`VRChat user ${username} not found`);
          }
        }
      }
      
      ctx.body = {
        success: true,
        data: assignment
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Remove role from user
  @Delete("/api/vrchat/whitelist/users/:username/roles/:roleName")
  async removeRoleFromUser(ctx: Context) {
    try {
      const { username, roleName } = ctx.params;
      let success = false;
      
      // Check if it's a Discord ID (snowflake pattern)
      if (/^\d{17,19}$/.test(username)) {
        success = await whitelistManager.removeRoleByDiscordId(username, roleName);
      } else {
        // Try as VRChat User ID first, then as username
        if (username.startsWith('usr_')) {
          // Find Discord ID from VRChat User ID
          const vrcAccount = await prisma.vRChatAccount.findFirst({
            where: { vrcUserId: username },
            include: { user: true }
          });
          if (vrcAccount) {
            success = await whitelistManager.removeRoleByDiscordId(vrcAccount.user.discordId, roleName);
          }
        } else {
          // Search for VRChat user by username and remove role
          try {
            const { searchUsers } = await import('../../../utility/vrchat/user.js');
            const searchResults = await searchUsers({ search: username, n: 1 });
            if (searchResults.length > 0) {
              const vrcAccount = await prisma.vRChatAccount.findFirst({
                where: { vrcUserId: searchResults[0].id },
                include: { user: true }
              });
              if (vrcAccount) {
                success = await whitelistManager.removeRoleByDiscordId(vrcAccount.user.discordId, roleName);
              }
            }
          } catch (error) {
            success = false;
          }
        }
      }
      
      if (!success) {
        ctx.status = 404;
        ctx.body = {
          success: false,
          error: "User or role not found, or assignment doesn't exist"
        };
        return;
      }

      ctx.body = {
        success: true,
        message: "Role removed from user successfully"
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Bulk import users
  @Post("/api/vrchat/whitelist/import")
  async bulkImportUsers(ctx: Context) {
    try {
      const { csvContent } = ctx.request.body as any;
      
      if (!csvContent) {
        ctx.status = 400;
        ctx.body = {
          success: false,
          error: "csvContent is required"
        };
        return;
      }

      const result = await whitelistManager.bulkImportUsers(csvContent);
      
      ctx.body = {
        success: true,
        data: result
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Get whitelist statistics
  @Get("/api/vrchat/whitelist/stats")
  async getStatistics(ctx: Context) {
    try {
      const stats = await whitelistManager.getStatistics();
      
      ctx.body = {
        success: true,
        data: stats
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }

  // Cleanup expired roles
  @Post("/api/vrchat/whitelist/cleanup")
  async cleanupExpiredRoles(ctx: Context) {
    try {
      const cleanedCount = await whitelistManager.cleanupExpiredRoles();
      
      ctx.body = {
        success: true,
        data: {
          cleanedCount,
          message: `Removed ${cleanedCount} expired role assignments`
        }
      };
    } catch (error: any) {
      ctx.status = 500;
      ctx.body = {
        success: false,
        error: error.message
      };
    }
  }
}
