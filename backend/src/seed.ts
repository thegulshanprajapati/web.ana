import { PrismaClient } from '@prisma/client';
import bcryptjs from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // Default users to seed
  const defaultUsers = [
    { userId: 'admin', password: 'admin123', fullName: 'Administrator', email: 'admin@wautomate.com' },
    { userId: 'user', password: 'password123', fullName: 'Test User', email: 'user@wautomate.com' },
    { userId: 'default', password: 'default123', fullName: 'Default Session', email: 'default@wautomate.com' }
  ];

  for (const userData of defaultUsers) {
    try {
      // Check if user exists
      const existingUser = await prisma.user.findUnique({
        where: { userId: userData.userId }
      });

      if (!existingUser) {
        // Hash password
        const hashedPassword = await bcryptjs.hash(userData.password, 10);

        // Create user
        await prisma.user.create({
          data: {
            userId: userData.userId,
            password: hashedPassword,
            fullName: userData.fullName,
            email: userData.email
          }
        });

        console.log(`✅ Created user: ${userData.userId}`);
      } else {
        console.log(`⚠️  User already exists: ${userData.userId}`);
      }
    } catch (err: any) {
      console.error(`❌ Error creating user ${userData.userId}:`, err.message);
    }
  }

  console.log('\n✅ Database seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
