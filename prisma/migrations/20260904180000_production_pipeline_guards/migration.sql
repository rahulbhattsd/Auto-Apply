CREATE TABLE "CandidateDailyApplicationCount" (
    "id" SERIAL NOT NULL,
    "candidateId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateDailyApplicationCount_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateDailyApplicationCount_candidateId_date_key" ON "CandidateDailyApplicationCount"("candidateId", "date");

CREATE UNIQUE INDEX "DeadLetter_queueName_jobId_key" ON "DeadLetter"("queueName", "jobId");
