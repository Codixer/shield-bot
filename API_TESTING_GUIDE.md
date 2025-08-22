# API Testing Guide

This guide demonstrates how to test the Discord Activity Attendance System API endpoints.

## Prerequisites

1. Start the application:
   ```bash
   yarn build && yarn start
   ```

2. Set up environment variables (required for Discord OAuth):
   ```
   DISCORD_CLIENT_ID=your_client_id
   DISCORD_CLIENT_SECRET=your_client_secret
   DISCORD_REDIRECT_URI=your_redirect_uri
   ```

## Testing with curl

### 1. Create a User
```bash
curl -X POST http://localhost:3000/api/users/discord/123456789012345678 \
  -H "Content-Type: application/json" \
  -d '{"discordId": "123456789012345678"}'
```

### 2. Create an Event
```bash
curl -X POST http://localhost:3000/api/attendance/events \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-08-22T20:00:00.000Z",
    "hostId": 1
  }'
```

### 3. Add User to Squad
```bash
curl -X POST http://localhost:3000/api/attendance/events/1/squads/Adam/members \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

### 4. Get Event Summary
```bash
curl -X GET http://localhost:3000/api/attendance/events/1
```

### 5. Set Active Event for User
```bash
curl -X PUT http://localhost:3000/api/attendance/users/1/active-event \
  -H "Content-Type: application/json" \
  -d '{"eventId": 1}'
```

### 6. Get User's Active Event
```bash
curl -X GET http://localhost:3000/api/attendance/users/1/active-event
```

### 7. Mark User as Lead
```bash
curl -X PUT http://localhost:3000/api/attendance/events/1/users/1/lead
```

### 8. Mark User as Late
```bash
curl -X PUT http://localhost:3000/api/attendance/events/1/users/1/late \
  -H "Content-Type: application/json" \
  -d '{"note": "Traffic delay"}'
```

### 9. Move User to Different Squad
```bash
curl -X PUT http://localhost:3000/api/attendance/events/1/users/1/move \
  -H "Content-Type: application/json" \
  -d '{"squadName": "Baker"}'
```

### 10. Mark User as Split
```bash
curl -X PUT http://localhost:3000/api/attendance/events/1/users/1/split \
  -H "Content-Type: application/json" \
  -d '{
    "newSquadName": "Charlie",
    "splitFrom": "Baker"
  }'
```

### 11. Add Staff Member
```bash
curl -X POST http://localhost:3000/api/attendance/events/1/staff \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

### 12. Set Co-Host
```bash
curl -X PUT http://localhost:3000/api/attendance/events/1/cohost \
  -H "Content-Type: application/json" \
  -d '{"userId": 1}'
```

### 13. Remove User from Event
```bash
curl -X DELETE http://localhost:3000/api/attendance/events/1/users/1
```

### 14. Delete Event
```bash
curl -X DELETE http://localhost:3000/api/attendance/events/1
```

## Testing with Postman

1. Import the following collection into Postman
2. Set the base URL to `http://localhost:3000`
3. Run the requests in the order shown above

## Discord OAuth Testing

To test the Discord OAuth flow, you'll need a valid authorization code from Discord:

```bash
curl -X POST http://localhost:3000/api/discord/token \
  -H "Content-Type: application/json" \
  -d '{"code": "your_discord_auth_code"}'
```

## Expected Responses

### User Creation Response:
```json
{
  "id": 1,
  "discordId": "123456789012345678",
  "username": null,
  "avatar": null
}
```

### Event Creation Response:
```json
{
  "id": 1,
  "date": "2025-08-22T20:00:00.000Z",
  "hostId": 1,
  "cohostId": null,
  "createdAt": "2025-08-22T15:30:00.000Z",
  "updatedAt": "2025-08-22T15:30:00.000Z"
}
```

### Event Summary Response:
```json
{
  "id": 1,
  "date": "2025-08-22T20:00:00.000Z",
  "hostId": 1,
  "cohostId": null,
  "createdAt": "2025-08-22T15:30:00.000Z",
  "updatedAt": "2025-08-22T15:30:00.000Z",
  "host": {
    "id": 1,
    "discordId": "123456789012345678",
    "username": null,
    "avatar": null
  },
  "cohost": null,
  "staff": [],
  "squads": [
    {
      "id": 1,
      "name": "Adam",
      "eventId": 1,
      "members": [
        {
          "id": 1,
          "userId": 1,
          "squadId": 1,
          "isLead": true,
          "isLate": true,
          "lateNote": "Traffic delay",
          "isSplit": false,
          "splitFrom": null,
          "user": {
            "id": 1,
            "discordId": "123456789012345678",
            "username": null,
            "avatar": null
          }
        }
      ]
    }
  ]
}
```

## Error Responses

### 400 Bad Request:
```json
{
  "error": "Invalid eventId"
}
```

### 404 Not Found:
```json
{
  "error": "Event not found"
}
```

### 500 Internal Server Error:
```json
{
  "error": "Internal server error"
}
```
