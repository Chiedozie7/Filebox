const pool = require("../config/db");

const createFile = async ({
    originalName,
    storedName,
    fileType,
    fileSize,
}) => {
    const result = await pool.query(
        `INSERT INTO files
        (original_name, stored_name, file_type, file_size)
        VALUES ($1, $2, $3, $4)
        RETURNING *`,
        [originalName, storedName, fileType, fileSize]
    );

    return result.rows[0];
};

const getAllFiles = async () => {
    const result = await pool.query(
        "SELECT * FROM files ORDER BY created_at DESC"
    );

    return result.rows;
};

const getStoredNames = async () => {
    const result = await pool.query("SELECT stored_name FROM files");
    return result.rows.map((row) => row.stored_name);
};

module.exports = {
    createFile,
    getAllFiles,
    getStoredNames,
};
