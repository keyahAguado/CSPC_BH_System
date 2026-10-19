const fail=(status,message)=>Object.assign(new Error(message),{status});
const identity=row=>JSON.stringify([Number(row.room_id),row.name,String(row.check_in_date)]);

async function manualScopes(c) {
    const [tables]=await c.query('SHOW TABLES');
    const exists=new Set(tables.map(row=>Object.values(row)[0]));
    return ['', 'zz_snap_'].filter(prefix=>['occupants','rooms','boarding_houses'].every(table=>exists.has(prefix+table)));
}
async function rowsFor(c,prefix,{ids,ownerId=null,lock=false}={}) {
    const ot=c.escapeId(prefix+'occupants'),rt=c.escapeId(prefix+'rooms'),ht=c.escapeId(prefix+'boarding_houses');
    return (await c.query(`SELECT o.id,o.room_id,o.student_id,o.is_non_cspc,o.reference_no,o.name,o.check_in_date,o.check_out_date,
        r.room_number,bh.owner_id,bh.name AS house_name FROM ${ot} o JOIN ${rt} r ON r.id=o.room_id JOIN ${ht} bh ON bh.id=r.house_id
        WHERE ${ids?'o.id IN (?)':'o.is_non_cspc=1 AND o.student_id IS NULL AND (? IS NULL OR bh.owner_id=?)'}
        ORDER BY o.id${lock?' FOR UPDATE':''}`,ids?[ids]:[ownerId,ownerId]))[0];
}
export async function listManualTestRecords(pool,{ownerId=null}={}) {
    const c=await pool.getConnection();
    try {
        const records=new Map();
        for(const prefix of await manualScopes(c))for(const row of await rowsFor(c,prefix,{ownerId})) {
            const key=Number(row.id),previous=records.get(key);
            if(previous){previous.inSnapshot ||= !!prefix;previous.inCurrent ||= !prefix;previous.identityConflict ||= identity(previous)!==identity(row);}
            else records.set(key,{...row,id:key,inSnapshot:!!prefix,inCurrent:!prefix,identityConflict:false});
        }
        return [...records.values()];
    } finally {c.release();}
}
export async function resetManualTests(pool,{occupantIds,ownerId=null,confirmed=false}={}) {
    if(confirmed!==true || !Array.isArray(occupantIds) || !occupantIds.length || occupantIds.length>50 || occupantIds.some(id=>!Number.isSafeInteger(id)||id<1))throw fail(400,'Select 1-50 manual test records and confirm clearing their history.');
    const ids=[...new Set(occupantIds)],c=await pool.getConnection();
    try {
        await c.beginTransaction();
        const scopes=[],seen=new Map();
        for(const prefix of await manualScopes(c)) {
            const rows=await rowsFor(c,prefix,{ids,lock:true});
            for(const row of rows) {
                if(Number(row.is_non_cspc)!==1 || row.student_id!=null || (row.reference_no && !/^NC-\d+$/i.test(row.reference_no)))throw fail(409,'Only unlinked manual Non-CSPC records can be cleared here. Nothing was cleared.');
                if(ownerId!=null && Number(row.owner_id)!==Number(ownerId))throw fail(403,'A selected record belongs to another owner. Nothing was cleared.');
                const previous=seen.get(Number(row.id));
                if(previous && previous!==identity(row))throw fail(409,'A record ID refers to different residents in current data and the snapshot. Restore and review before clearing. Nothing was cleared.');
                seen.set(Number(row.id),identity(row));
            }
            scopes.push({prefix,rows});
        }
        if(ids.some(id=>!seen.has(id)))throw fail(409,'A selected manual record no longer exists. Refresh the list. Nothing was cleared.');
        const counts=[];
        for(const {prefix,rows} of scopes) {
            if(!rows.length)continue;
            const [result]=await c.query(`DELETE FROM ${c.escapeId(prefix+'occupants')} WHERE id IN (?) AND is_non_cspc=1 AND student_id IS NULL`,[rows.map(row=>Number(row.id))]);
            if(result.affectedRows!==rows.length)throw fail(409,'A selected record changed during cleanup. Nothing was cleared.');
            counts.push({scope:prefix?'saved snapshot':'current data',occupants:result.affectedRows});
        }
        await c.commit();
        return {success:true,counts,message:'Selected manual Non-CSPC stay and local payment records were cleared from current data and the saved snapshot. Student bookings, accounts, rooms and other occupants were kept. No provider payment was reversed.'};
    } catch(error){await c.rollback();throw error;}finally{c.release();}
}
