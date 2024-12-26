// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AttackLogger {
    struct AttackLog {
        string attackId;
        address reporter;
        uint256 timestamp;
        string attackType;
        uint8 confidence;
        string sourceIp;
        string protocol;
        uint256 requestCount;
        string[] indicators;
    }

    event AttackLogged(
        string indexed attackId,
        address indexed reporter,
        uint256 timestamp,
        string attackType,
        string sourceIp,
        string protocol
    );

    mapping(string => AttackLog) public attacks;
    string[] public attackIds;

    function logAttack(
        string memory _attackId,
        string memory _attackType,
        uint8 _confidence,
        string memory _sourceIp,
        string memory _protocol,
        uint256 _requestCount,
        string[] memory _indicators
    ) public {
        require(bytes(_attackId).length > 0, "Attack ID required");
        require(bytes(attacks[_attackId].attackId).length == 0, "Attack ID already exists");

        AttackLog memory newAttack = AttackLog({
            attackId: _attackId,
            reporter: msg.sender,
            timestamp: block.timestamp,
            attackType: _attackType,
            confidence: _confidence,
            sourceIp: _sourceIp,
            protocol: _protocol,
            requestCount: _requestCount,
            indicators: _indicators
        });

        attacks[_attackId] = newAttack;
        attackIds.push(_attackId);

        emit AttackLogged(
            _attackId,
            msg.sender,
            block.timestamp,
            _attackType,
            _sourceIp,
            _protocol
        );
    }

    function getAttack(string memory _attackId) public view returns (
        string memory attackId,
        address reporter,
        uint256 timestamp,
        string memory attackType,
        uint8 confidence,
        string memory sourceIp,
        string memory protocol,
        uint256 requestCount,
        string[] memory indicators
    ) {
        AttackLog memory attack = attacks[_attackId];
        require(bytes(attack.attackId).length > 0, "Attack not found");

        return (
            attack.attackId,
            attack.reporter,
            attack.timestamp,
            attack.attackType,
            attack.confidence,
            attack.sourceIp,
            attack.protocol,
            attack.requestCount,
            attack.indicators
        );
    }

    function getAttackCount() public view returns (uint256) {
        return attackIds.length;
    }

    function getAttackIds(uint256 start, uint256 limit) public view returns (string[] memory) {
        require(start < attackIds.length, "Start index out of bounds");
        
        uint256 end = start + limit;
        if (end > attackIds.length) {
            end = attackIds.length;
        }
        
        string[] memory result = new string[](end - start);
        for (uint256 i = start; i < end; i++) {
            result[i - start] = attackIds[i];
        }
        
        return result;
    }
}
