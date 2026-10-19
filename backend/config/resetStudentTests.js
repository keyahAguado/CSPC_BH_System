const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function resetStudentTests(pool,{studentIds,ownerId=null,confirmed=false}={}) {
    if(confirmed!==true || !Array.isArray(studentIds) || !studentIds.length || studentIds.length>20 || studentIds.some(id=>!Number.isSafeInteger(id)||id<1))throw fail(400,'Select 1–20 test students and confirm clearing their test transactions.');
    const ids=[...new Set(studentIds)],c=await pool.getConnection();
    try {
        await c.beginTransaction();
        const [users]=await c.query("SELECT id FROM users WHERE id IN (?) AND role='student' FOR UPDATE",[ids]);
        if(users.length!==ids.length)throw fail(400,'Every selected account must be a student.');
        const [tables]=await c.query('SHOW TABLES');const exists=new Set(tables.map(r=>Object.values(r)[0]));
        const counts=[];
        // Check both scopes first, so permissions/dependency failures never partially clean a snapshot.
        const scopes=[];
        for(const prefix of ['', 'zz_snap_']){
            if(!exists.has(prefix+'bookings'))continue;
            const bt=c.escapeId(prefix+'bookings'),ot=c.escapeId(prefix+'occupants'),ht=c.escapeId(prefix+'boarding_houses'),rt=c.escapeId(prefix+'rooms');
            const [bs]=await c.query(`SELECT b.id,bh.owner_id FROM ${bt} b JOIN ${ht} bh ON bh.id=b.house_id WHERE b.student_id IN (?) FOR UPDATE`,[ids]);
            const [os]=await c.query(`SELECT o.id,bh.owner_id FROM ${ot} o JOIN ${rt} r ON r.id=o.room_id JOIN ${ht} bh ON bh.id=r.house_id WHERE o.student_id IN (?) FOR UPDATE`,[ids]);
            if(ownerId && [...bs,...os].some(row=>Number(row.owner_id)!==Number(ownerId)))throw fail(403,'A selected student has transactions under another owner. Ask an administrator to reset that account, or select a dedicated test account. Nothing was cleared.');
            const bookingIds=bs.map(b=>Number(b.id));
            const [linked]=await c.query(`SELECT renewal_sources FROM ${bt} WHERE student_id NOT IN (?) AND renewal_sources IS NOT NULL`,[ids]);
            if(linked.some(b=>{try{return JSON.parse(b.renewal_sources).some(id=>bookingIds.includes(Number(id)));}catch{return true;}}))throw fail(409,'Another student has a linked renewal test. Select all participating test students together before restarting.');
            scopes.push({prefix,bt,ot,bookingIds});
        }
        for(const {prefix,bt,ot,bookingIds} of scopes){
            let notifications=0;
            if(bookingIds.length){
                const nt=c.escapeId(prefix+'notifications'),dt=c.escapeId(prefix+'notification_email_deliveries');
                const links=bookingIds.map(id=>'/student/bookings/'+id);
                const pattern=bookingIds.map(id=>'REF-'+String(id).padStart(4,'0')+'([^0-9]|$)').join('|');
                // Exact references/links only: preserve unrelated application/account notices.
                if(exists.has(prefix+'notification_email_deliveries'))await c.query(`DELETE d FROM ${dt} d JOIN ${nt} n ON n.id=d.notification_id WHERE n.link IN (?) OR n.message REGEXP ?`,[links,pattern]);
                const [n]=await c.query(`DELETE FROM ${nt} WHERE link IN (?) OR message REGEXP ?`,[links,pattern]);notifications=n.affectedRows;
            }
            const [o]=await c.query(`DELETE FROM ${ot} WHERE student_id IN (?)`,[ids]);
            const [b]=await c.query(`DELETE FROM ${bt} WHERE student_id IN (?)`,[ids]);
            counts.push({scope:prefix?'saved snapshot':'current data',bookings:b.affectedRows,occupants:o.affectedRows,notifications});
        }
        await c.commit();return {success:true,counts,message:'Selected students now have no local bookings or occupancy. Their accounts and property setup were kept. The saved snapshot was cleaned too. Provider payments and uploaded files were not reversed.'};
    }catch(error){await c.rollback();throw error;}finally{c.release();}
}
