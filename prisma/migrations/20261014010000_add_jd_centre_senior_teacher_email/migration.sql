-- Senior teacher's email per centre, CC'd on the JD "For Approval" email.
ALTER TABLE "JdCentreProfile" ADD COLUMN "seniorTeacherEmail" TEXT NOT NULL DEFAULT '';
