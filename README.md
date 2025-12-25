# Shield Bot

A comprehensive Discord bot built with Discord.js v14 and DiscordX framework, featuring VRChat API integration for community management, verification, attendance tracking, patrol systems, and whitelist management.

## 🌟 Features

### VRChat Integration
- **Account Verification**: Multi-step verification system for VRChat accounts (main and alt accounts)
- **Friend Request Management**: Automated friend request handling and verification
- **Location Tracking**: Real-time VRChat world location tracking with consent management
- **Group Management**: VRChat group role synchronization with Discord roles
- **Whitelist System**: Role-based VRChat world access control with permission management
- **WebSocket Integration**: Real-time event processing from VRChat API

### Attendance System
- **Event Management**: Create and manage attendance events with host/co-host support
- **Squad Organization**: Organize members into squads with lead assignments
- **Late Tracking**: Track late arrivals and early departures
- **Staff Management**: Separate staff tracking for events
- **Autofill**: Automated attendance population from voice channels

### Patrol System
- **Voice Time Tracking**: Automatic tracking of time spent in patrol voice channels
- **Monthly Aggregation**: Aggregated monthly statistics for patrol hours
- **Promotion Notifications**: Automated notifications when users reach promotion thresholds
- **Session Persistence**: Patrol sessions survive bot restarts

### User Management
- **Multi-Account Support**: Link multiple VRChat accounts to Discord profiles
- **Permission Levels**: Hierarchical permission system (Bot Owner, Dev Guard, Staff, Trainer, Host, Shield Member, User)
- **Role Verification**: Automated role assignment based on VRChat group membership

### API Server
- **Whitelist API**: RESTful endpoints for whitelist management
- **File Upload**: Support for batch whitelist operations
- **Health Check**: API status endpoint

## 📋 Prerequisites

- **Node.js**: >= 20.0.0
- **npm**: >= 7.0.0 (or Yarn 1.22.22)
- **MySQL/MariaDB**: Database server
- **Discord Bot Token**: From [Discord Developer Portal](https://discord.com/developers/applications)
- **VRChat Account**: For VRChat API integration

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone https://github.com/Xeravax/shield-bot.git
cd shield-bot
```

### 2. Install Dependencies

Using Yarn (recommended):
```bash
yarn install
```

Using npm:
```bash
npm install
```

### 3. Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Discord Configuration
BOT_TOKEN=your_discord_bot_token
APPLICATION_ID=your_discord_application_id
BOT_OWNER_ID=your_discord_user_id

# Database Configuration
DATABASE_URL=mysql://username:password@localhost:3306/shield_bot

# API Configuration
PORT=3000
ENV=development

# VRChat Configuration
VRCHAT_USERNAME=your_vrchat_username
VRCHAT_PASSWORD=your_vrchat_password
VRCHAT_OTP_TOKEN=your_2fa_secret_token
VRCHAT_RECOVERY=your_recovery_code
VRCHAT_USER_AGENT=your_user_agent

# Whitelist Configuration
WHITELIST_XOR_KEY=your_xor_encryption_key

# GitHub Configuration (for whitelist backup)
GITHUB_TOKEN=your_github_token
GITHUB_REPO_OWNER=repository_owner
GITHUB_REPO_NAME=repository_name
GITHUB_REPO_BRANCH=main
GITHUB_REPO_ENCODED_FILE_PATH=whitelist.encoded.txt
GITHUB_REPO_DECODED_FILE_PATH=whitelist.txt

# Git Signing Configuration (optional)
GIT_SIGN_COMMITS=false
GIT_AUTHOR_NAME=your_name
GIT_AUTHOR_EMAIL=your_email
GIT_COMMITTER_NAME=your_name
GIT_COMMITTER_EMAIL=your_email
GIT_PGP_PRIVATE_KEY=your_pgp_private_key
GIT_PGP_PASSPHRASE=your_passphrase
```

### 4. Database Setup

Initialize the Prisma database:

```bash
# Generate Prisma client
npx prisma generate

# Run migrations to create database schema
npx prisma migrate deploy
```

For development with schema changes:
```bash
npx prisma migrate dev
```

View your database with Prisma Studio:
```bash
npx prisma studio
```

### 5. Build the Project

```bash
yarn build
```

## 🎮 Usage

### Development Mode

Run with hot reload:
```bash
yarn dev
```

Or with nodemon:
```bash
yarn watch
```

### Production Mode

Build and start:
```bash
yarn build
yarn start:prod
```

## 🏗️ Architecture

### Project Structure

```
shield-bot/
├── prisma/
│   ├── models/           # Split Prisma schema files
│   ├── migrations/       # Database migrations
│   └── schema.prisma     # Main Prisma configuration
├── src/
│   ├── api/              # REST API endpoints
│   ├── commands/         # Discord slash commands
│   │   ├── attendance/   # Attendance management commands
│   │   ├── patrol/       # Patrol system commands
│   │   ├── settings/     # Bot configuration commands
│   │   ├── user/         # User management commands
│   │   ├── verification/ # Verification commands
│   │   ├── vrchat/       # VRChat integration commands
│   │   └── whitelist/    # Whitelist management commands
│   ├── events/           # Event handlers
│   │   └── vrchat/       # VRChat WebSocket event handlers
│   ├── managers/         # Business logic managers
│   │   ├── attendance/   # Attendance system manager
│   │   ├── groupRoleSync/# VRChat group role sync
│   │   ├── messages/     # Message management
│   │   ├── patrol/       # Patrol timer manager
│   │   └── whitelist/    # Whitelist manager
│   ├── schedules/        # Cron job schedules
│   ├── utility/          # Utility functions and helpers
│   │   ├── guards.ts     # Permission guards
│   │   └── vrchat/       # VRChat API wrappers
│   └── main.ts           # Application entry point
├── .env.example          # Environment variables template
├── package.json          # Dependencies and scripts
└── tsconfig.json         # TypeScript configuration
```

### Technology Stack

- **Framework**: [DiscordX](https://discordx.js.org/) - Modern Discord.js framework with decorators
- **Discord**: [Discord.js v14](https://discord.js.org/) - Discord API library
- **Database**: [Prisma ORM](https://www.prisma.io/) with MySQL
- **VRChat API**: [vrchat npm package](https://www.npmjs.com/package/vrchat)
- **API Server**: [Koa](https://koajs.com/) - Web framework
- **Language**: TypeScript with ESM modules
- **Task Scheduling**: [node-cron](https://www.npmjs.com/package/node-cron)

### Key Components

#### Commands
Commands use the DiscordX decorator pattern with slash command groups:

```typescript
@Discord()
@SlashGroup({ name: "verify", description: "Verification commands" })
@SlashGroup("verify")
@Guard(VRChatLoginGuard)
export class VerifyCommand {
  @Slash({ description: "Start verification" })
  async account(interaction: CommandInteraction) {
    // Command implementation
  }
}
```

#### Guards
Custom guards protect commands with permission checks:
- `VRChatLoginGuard`: Ensures VRChat API is authenticated
- `StaffGuard`: Requires staff role
- `DevGuardAndStaffGuard`: Requires dev guard or staff role

#### Managers
Singleton pattern managers handle complex business logic:
- **WhitelistManager**: Manages VRChat world access permissions
- **PatrolTimerManager**: Tracks voice channel time
- **InviteMessageManager**: Syncs dynamic Discord invites

#### Database Models
Key models include:
- **User**: Discord user with VRChat account links
- **VRChatAccount**: VRChat account verification status
- **WhitelistEntry**: Whitelist permissions with role assignments
- **AttendanceEvent**: Event tracking with squad organization
- **VoicePatrolTime**: Voice channel time tracking
- **GuildSettings**: Per-guild configuration

## 📚 Commands

### Verification Commands
- `/verify account` - Start VRChat account verification
- `/verify management list` - List verified accounts
- `/verify management remove` - Remove verified account

### Whitelist Commands
- `/whitelist add` - Add user to whitelist
- `/whitelist remove` - Remove user from whitelist
- `/whitelist list` - View whitelist entries
- `/whitelist setuprole` - Configure role-based permissions

### Attendance Commands
- `/attendance create` - Create new attendance event
- `/attendance select` - Select squad for attendance
- `/attendance lead` - Mark as squad leader
- `/attendance late` - Mark member as late
- `/attendance left` - Mark member as left
- `/attendance delete` - Delete attendance event

### Patrol Commands
- `/patrol stats` - View patrol time statistics
- `/patrol leaderboard` - View patrol leaderboard

### Settings Commands
- `/settings group` - Configure VRChat group settings
- `/settings roles` - Configure Discord role mappings
- `/settings attendance` - Configure attendance settings
- `/settings patrol` - Configure patrol settings
- `/settings vrchat` - Configure VRChat integration
- `/settings whitelist` - Configure whitelist settings

### VRChat Commands
- `/vrchat requests pending` - View pending friend requests
- `/vrchat requests accept` - Accept friend request
- `/vrchat requests reject` - Reject friend request
- `/vrchat status` - View VRChat bot status

### User Commands
- `/user group roles` - View user's VRChat group roles
- `/user group promote` - Promote user in VRChat group
- `/user group demote` - Demote user in VRChat group

## 🔧 Development

### Build System

```bash
# Development build with watch
yarn watch

# Production build
yarn build:prod

# Generate changelog
yarn build:changelog
```

### Database Management

```bash
# Create migration
npx prisma migrate dev --name migration_name

# Apply migrations
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Open Prisma Studio
npx prisma studio
```

### Code Style

The project uses Prettier for code formatting:

```bash
# Format code
npx prettier --write .
```

### Adding New Commands

1. Create a new file in `src/commands/[category]/`
2. Use DiscordX decorators:

```typescript
import { Discord, Slash, SlashOption, Guard } from "discordx";
import { CommandInteraction } from "discord.js";

@Discord()
export class MyCommand {
  @Slash({ description: "My command description" })
  @Guard(StaffGuard)
  async mycommand(interaction: CommandInteraction) {
    await interaction.reply("Hello!");
  }
}
```

3. The command will be auto-loaded via the importer

### Adding Database Models

1. Create or edit files in `prisma/models/`
2. Run `npx prisma migrate dev`
3. Generate client: `npx prisma generate`

## 🔐 Security

- **Environment Variables**: Never commit `.env` file
- **API Keys**: Store VRChat credentials securely
- **PGP Signing**: Optional commit signing for whitelist changes
- **Permission System**: Hierarchical role-based access control
- **Input Validation**: All user inputs are validated
- **XOR Encryption**: Whitelist data is encrypted before storage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow existing code style and patterns
- Use TypeScript strict mode
- Add JSDoc comments for complex functions
- Update Prisma schema for database changes
- Test commands in development environment
- Use ESM imports with `.js` extensions

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👥 Authors

- **Stefano** - [@Xeravax](https://github.com/Xeravax) - stefano@stefanocoding.me

## 🙏 Acknowledgments

- [DiscordX](https://discordx.js.org/) - Simplifying Discord bot development
- [Discord.js](https://discord.js.org/) - Comprehensive Discord API library
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [VRChat API](https://vrchatapi.github.io/) - VRChat API documentation

## 📞 Support

For support, issues, or feature requests, please open an issue on the [GitHub repository](https://github.com/Xeravax/shield-bot/issues).

## ⚠️ Disclaimer

This bot is not affiliated with or endorsed by VRChat Inc. Use at your own risk. Ensure compliance with VRChat's Terms of Service when using VRChat API integration features.
