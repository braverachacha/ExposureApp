// clientServer/src/db/init.js
import fs from 'fs';
import { DB_PATH, REQUESTS_DB_PATH, openDb, migratePlaintextConfig, deleteOldRequests } from './index.js';

const CLEANUP_HOURS = 1;
const CLEANUP_SECONDS = CLEANUP_HOURS * 3600;

export async function initDatabase() {
 const dbExists = fs.existsSync(DB_PATH);

 try {
   await openDb();

   // ── Migrate any plaintext config values to encrypted ──
   let migrated = 0;
   try {
     migrated = await migratePlaintextConfig();
   } catch (err) {
     console.warn(`[DB] Config migration warning: ${err.message}`);
   }

   // ── Cleanup old requests ──
   const cutoff = Math.floor(Date.now() / 1000) - CLEANUP_SECONDS;
   let filesDeleted = 0;
   let rowsDeleted = 0;

   try {
     const { getRecentRequests } = await import('./index.js');
     const oldRequests = await getRecentRequests(10000);

     for (const req of oldRequests) {
       if (req.createdAt < cutoff) {
         if (req.reqBodyPath && fs.existsSync(req.reqBodyPath)) {
           try { fs.unlinkSync(req.reqBodyPath); filesDeleted++; } catch {}
         }
         if (req.resBodyPath && fs.existsSync(req.resBodyPath)) {
           try { fs.unlinkSync(req.resBodyPath); filesDeleted++; } catch {}
         }
       }
     }

     rowsDeleted = await deleteOldRequests(cutoff);
   } catch (err) {
     console.warn(`[DB] Cleanup warning: ${err.message}`);
   }

   if (rowsDeleted > 0 || filesDeleted > 0) {
     console.log(`[DB] Cleanup: ${rowsDeleted} rows, ${filesDeleted} files (>${CLEANUP_HOURS}hr)`);
   }

   return {
     created: !dbExists,
     cleaned: rowsDeleted,
     filesDeleted,
     migrated,
   };

 } catch (err) {
   console.error(`[DB] Init failed: ${err.message}`);
   return { created: false, cleaned: 0, error: err.message };
 }
}
