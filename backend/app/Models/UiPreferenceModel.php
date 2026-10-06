<?php

// SPDX-License-Identifier: MIT

namespace App\Models;

use CodeIgniter\Model;

class UiPreferenceModel extends Model
{
    protected $table         = 'ui_preferences';
    protected $primaryKey    = 'user_id';
    protected $returnType    = 'array';
    protected $useAutoIncrement = false;
    protected $useTimestamps = true;

    protected $allowedFields = ['user_id', 'theme', 'mode', 'font', 'reduced_motion', 'high_contrast'];
}
