-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "systemPrompt" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keySalt" TEXT NOT NULL,
    "keyIv" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "mode" TEXT NOT NULL,
    "seed" TEXT NOT NULL,
    "maxSeats" INTEGER NOT NULL DEFAULT 6,
    "startingStack" INTEGER NOT NULL DEFAULT 2000,
    "currentHandNumber" INTEGER NOT NULL DEFAULT 0,
    "currentLevelIndex" INTEGER NOT NULL DEFAULT 0,
    "playbackSpeedMs" INTEGER NOT NULL DEFAULT 300,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME
);

-- CreateTable
CREATE TABLE "MatchSeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "seatIndex" INTEGER NOT NULL,
    "stack" INTEGER NOT NULL,
    "isEliminated" BOOLEAN NOT NULL DEFAULT false,
    "finishPlace" INTEGER,
    CONSTRAINT "MatchSeat_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchSeat_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchAction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "handNumber" INTEGER NOT NULL,
    "street" TEXT NOT NULL,
    "actorSeatIndex" INTEGER NOT NULL,
    "legalActionsJson" TEXT NOT NULL,
    "requestedActionJson" TEXT NOT NULL,
    "resolvedActionJson" TEXT NOT NULL,
    "rawResponse" TEXT NOT NULL,
    "validationError" TEXT,
    "retried" BOOLEAN NOT NULL DEFAULT false,
    "latencyMs" INTEGER,
    "tokenUsageJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "agentId" TEXT,
    CONSTRAINT "MatchAction_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchAction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "eventIndex" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MatchStanding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "matchId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "place" INTEGER NOT NULL,
    "ratingBefore" REAL NOT NULL,
    "ratingAfter" REAL NOT NULL,
    "delta" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MatchStanding_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MatchStanding_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppSecret" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "verifierHash" TEXT NOT NULL,
    "verifierSalt" TEXT NOT NULL,
    "kdfConfigJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AgentRating" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "agentId" TEXT NOT NULL,
    "rating" REAL NOT NULL DEFAULT 1200,
    "updatedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRating_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "MatchSeat_agentId_idx" ON "MatchSeat"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchSeat_matchId_seatIndex_key" ON "MatchSeat"("matchId", "seatIndex");

-- CreateIndex
CREATE INDEX "MatchAction_matchId_handNumber_idx" ON "MatchAction"("matchId", "handNumber");

-- CreateIndex
CREATE UNIQUE INDEX "MatchEvent_matchId_eventIndex_key" ON "MatchEvent"("matchId", "eventIndex");

-- CreateIndex
CREATE INDEX "MatchStanding_agentId_createdAt_idx" ON "MatchStanding"("agentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MatchStanding_matchId_agentId_key" ON "MatchStanding"("matchId", "agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRating_agentId_key" ON "AgentRating"("agentId");
