/**
 * VRChat Status Command
 * 
 * Fetches and displays the current status of VRChat services from their official status page.
 * This command retrieves the latest incidents and service updates from status.vrchat.com
 * and presents them in a user-friendly Discord embed format.
 * 
 * Features:
 * - Shows up to 3 most recent status entries with FULL incident history
 * - Displays all updates for each incident (investigating → monitoring → resolved)
 * - Color-coded status indicators (green for operational, red for issues)
 * - Emoji status indicators for different types of updates
 * - Timestamps for each update when available
 * - Links to detailed incident reports
 * - Automatic detection of active vs resolved issues
 * 
 * Usage: /vrchat status
 */

import { Discord, Slash, SlashGroup } from "discordx";
import {
  CommandInteraction,
  MessageFlags,
  InteractionContextType,
  ApplicationIntegrationType,
  EmbedBuilder,
} from "discord.js";
import fetch from "node-fetch";

interface StatusEntry {
  title: string;
  published: string;
  content: string;
  link: string;
}

@Discord()
@SlashGroup({
  name: "vrchat",
  description: "VRChat related commands.",
  contexts: [
    InteractionContextType.Guild,
  ],
  integrationTypes: [
    ApplicationIntegrationType.GuildInstall,
  ],
})
@SlashGroup("vrchat")
export class VRChatStatusCommand {
  @Slash({
    name: "status",
    description: "Check the current status of VRChat services from their status page.",
  })
  async status(interaction: CommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      // Fetch the VRChat status Atom feed
      const response = await fetch("https://status.vrchat.com/history.atom");
      
      if (!response.ok) {
        await interaction.editReply({
          content: `❌ Failed to fetch VRChat status: ${response.status} ${response.statusText}`,
        });
        return;
      }

      const atomContent = await response.text();
      
      // Parse entries using regex (more reliable than DOM parsing for this use case)
      const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
      const entries: StatusEntry[] = [];
      let match;
      
      while ((match = entryRegex.exec(atomContent)) !== null && entries.length < 3) {
        const entryContent = match[1];
        
        // Extract title
        const titleMatch = entryContent.match(/<title[^>]*>(.*?)<\/title>/);
        const title = titleMatch ? titleMatch[1].trim() : "Unknown Issue";
        
        // Extract published date
        const publishedMatch = entryContent.match(/<published[^>]*>(.*?)<\/published>/);
        const published = publishedMatch ? publishedMatch[1].trim() : "";
        
        // Extract content
        const contentMatch = entryContent.match(/<content[^>]*>([\s\S]*?)<\/content>/);
        const content = contentMatch ? contentMatch[1].trim() : "";
        
        // Extract link
        const linkMatch = entryContent.match(/<link[^>]*href="([^"]*)"[^>]*\/>/);
        const link = linkMatch ? linkMatch[1] : "";
        
        entries.push({ title, published, content, link });
      }
      
      if (entries.length === 0) {
        await interaction.editReply({
          content: "✅ No recent incidents found. VRChat services appear to be operating normally.",
        });
        return;
      }

      // Get feed update time
      const feedUpdatedMatch = atomContent.match(/<updated[^>]*>(.*?)<\/updated>/);
      const feedUpdated = feedUpdatedMatch ? feedUpdatedMatch[1].trim() : null;

      // Create embed
      const embed = new EmbedBuilder()
        .setTitle("🔧 VRChat Service Status")
        .setColor(0x1e3c72)
        .setURL("https://status.vrchat.com")
        .setTimestamp()
        .setFooter({ 
          text: "Data from status.vrchat.com",
          iconURL: "https://assets.vrchat.com/www/brand/logos/logo-vrchat-white-transparent-crop-1024.png"
        });

      if (feedUpdated) {
        embed.setDescription(`*Last updated: ${new Date(feedUpdated).toLocaleString()}*`);
      }

      // Process each entry
      for (const entry of entries) {
        // Parse the HTML content to extract ALL status updates
        const updates: { status: string; text: string; timestamp: string }[] = [];
        
        // Extract all <p> tags that contain status updates
        const updateMatches = entry.content.matchAll(/<p[^>]*>[\s\S]*?<strong[^>]*>(.*?)<\/strong>([\s\S]*?)<\/p>/g);
        
        for (const updateMatch of updateMatches) {
          const statusType = updateMatch[1].trim();
          let updateText = updateMatch[2].trim();
          
          // Extract timestamp from the update
          const timestampMatch = updateText.match(/<small[^>]*>.*?<var[^>]*>(\d{1,2})<\/var>.*?<var[^>]*>(\d{2}:\d{2})<\/var>\s+UTC<\/small>/);
          let timestamp = "";
          if (timestampMatch) {
            timestamp = `${timestampMatch[1]} UTC ${timestampMatch[2]}`;
            // Remove the timestamp from the update text
            updateText = updateText.replace(/<small[^>]*>.*?UTC<\/small><br\s*\/?>/g, "");
          }
          
          // Clean up the update text - remove HTML tags and extract meaningful content
          updateText = updateText.replace(/<[^>]*>/g, ""); // Remove HTML tags
          updateText = updateText.replace(/\s+/g, " ").trim(); // Normalize whitespace
          
          if (updateText.length > 0 && statusType.length > 0) {
            updates.push({
              status: statusType,
              text: updateText,
              timestamp: timestamp
            });
          }
        }
        
        // If no structured updates found, try to extract any meaningful text
        if (updates.length === 0) {
          const textMatch = entry.content.match(/>([^<]+)</);
          if (textMatch) {
            updates.push({
              status: "Update",
              text: textMatch[1].trim(),
              timestamp: ""
            });
          }
        }

        // Determine status emoji based on the most recent (first) update
        let statusEmoji = "🔄";
        if (updates.length > 0) {
          const latestStatus = updates[0].status.toLowerCase();
          if (latestStatus.includes("resolved") || latestStatus.includes("completed")) {
            statusEmoji = "✅";
          } else if (latestStatus.includes("investigating") || latestStatus.includes("identified")) {
            statusEmoji = "🔍";
          } else if (latestStatus.includes("monitoring")) {
            statusEmoji = "👀";
          } else if (latestStatus.includes("scheduled")) {
            statusEmoji = "📅";
          } else if (latestStatus.includes("progress")) {
            statusEmoji = "⚙️";
          }
        }

        // Format the date
        const dateStr = entry.published ? new Date(entry.published).toLocaleDateString() : "Unknown date";
        
        // Build the field value with all updates
        let fieldValue = "";
        
        if (updates.length > 0) {
          // Show all updates, with most recent first
          for (let i = 0; i < Math.min(updates.length, 4); i++) { // Limit to 4 updates to avoid hitting Discord limits
            const update = updates[i];
            let updateText = update.text;
            
            // Truncate individual updates if too long
            if (updateText.length > 300) {
              updateText = updateText.substring(0, 297) + "...";
            }
            
            fieldValue += `**${update.status}**`;
            if (update.timestamp) {
              fieldValue += ` *(${update.timestamp})*`;
            }
            fieldValue += ` - ${updateText}`;
            
            if (i < Math.min(updates.length, 4) - 1) {
              fieldValue += "\n\n";
            }
          }
          
          if (updates.length > 4) {
            fieldValue += `\n\n*...and ${updates.length - 4} more updates*`;
          }
        } else {
          fieldValue = "No detailed updates available.";
        }
        
        fieldValue += `\n\n*Incident Date: ${dateStr}*${entry.link ? ` • [View Full Details](${entry.link})` : ""}`;

        // Ensure field value doesn't exceed Discord's 1024 character limit
        if (fieldValue.length > 1024) {
          fieldValue = fieldValue.substring(0, 1000) + "...\n\n*[Truncated - View full details on status page]*";
          if (entry.link) {
            fieldValue += ` • [View Full Details](${entry.link})`;
          }
        }

        const fieldName = `${statusEmoji} ${entry.title}`;

        embed.addFields({
          name: fieldName,
          value: fieldValue,
          inline: false,
        });
      }

      // Overall status indicator based on the first (most recent) entry
      const firstEntry = entries[0];
      const hasActiveIssues = firstEntry.content.toLowerCase().includes("investigating") || 
                             firstEntry.content.toLowerCase().includes("identified") ||
                             firstEntry.content.toLowerCase().includes("progress") ||
                             firstEntry.title.toLowerCase().includes("issues") ||
                             firstEntry.title.toLowerCase().includes("outage") ||
                             firstEntry.title.toLowerCase().includes("maintenance");

      if (hasActiveIssues) {
        embed.setColor(0xff6b6b); // Red for active issues
        embed.setTitle("⚠️ VRChat Service Status - Issues Detected");
      } else {
        embed.setColor(0x51cf66); // Green for resolved/stable
        embed.setTitle("✅ VRChat Service Status - Services Operational");
      }

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("[VRChat Status Command] Error:", error);
      await interaction.editReply({
        content: "❌ An error occurred while fetching VRChat status. Please try again later.",
      });
    }
  }
}