const User = require('./user');
const Character = require('./character');
const Story = require('./story');
const LinkRequest = require('./linkrequest');
const Like = require('./like');
const Comment = require('./comment');

// --- 模型关联 (Associations) ---

// 1. 用户与角色 (User - Character)
// 一个用户可以拥有多个 OC
// 一个 OC 只能属于一个用户
User.hasMany(Character, {
  foreignKey: 'userId', // 已更新为 userId
  as: 'characters'
});

Character.belongsTo(User, {
  foreignKey: 'userId', // 已更新为 userId
  as: 'owner'
});

// 2. 角色与故事 (Character - Story)
// 这是一个复杂的多对多关系，因为一个故事可以有多个 OC 参与，一个 OC 也可以参与多个故事。
// 这里的实现方式取决于具体的数据库设计：
// 方案 A: 使用中间表 CharacterStories (标准做法)
// 方案 B: 仅单向关联或使用 JSON 字段存储 ID (当前 Story 模型使用了 chars: DataTypes.JSON)

// 为了满足 "Character.hasMany(Story)" 的查询需求，通常需要中间表。
// 但鉴于目前 Story 模型中使用了 JSON 数组存储 charIds，标准的 Sequelize 关联无法直接映射。
// 我们可以通过一种变通的 "虚拟关联" 或者仅仅在这里定义概念上的关联，
// 实际查询时可能需要手动处理，或者我们现在升级为标准的中间表模式。

// 为了完全满足用户的 "设置 Character.hasMany(Story)" 指令并保证查询有效，
// 最佳实践是创建一个中间表。但如果不想改动现有 Story 表结构（JSON 字段），
// 我们可以保留 JSON 字段，同时引入一个隐式的中间表来支持 Sequelize 的关联查询方法。
// 这里我们采用标准的 BelongsToMany 关系来建立多对多连接，这样 Sequelize 会自动维护一个中间表 'CharacterStories'。
// 
// 注意：这会创建一个新的中间表 'CharacterStories'。
// 现有的 Story.chars (JSON) 字段可以用作冗余备份或快速读取。

Character.belongsToMany(Story, {
  through: 'CharacterStories', // 中间表名称
  foreignKey: 'characterId',
  otherKey: 'storyId',
  as: 'stories'
});

Story.belongsToMany(Character, {
  through: 'CharacterStories',
  foreignKey: 'storyId',
  otherKey: 'characterId',
  as: 'participants'
});

// 3. 社交联动 (LinkRequest)
// LinkRequest 关联发起人、接收人、目标角色
User.hasMany(LinkRequest, { foreignKey: 'senderId', as: 'sentRequests' });
User.hasMany(LinkRequest, { foreignKey: 'receiverId', as: 'receivedRequests' });

LinkRequest.belongsTo(User, { foreignKey: 'senderId', as: 'sender' });
LinkRequest.belongsTo(User, { foreignKey: 'receiverId', as: 'receiver' });

Character.hasMany(LinkRequest, { foreignKey: 'targetCharId', as: 'linkRequests' });
LinkRequest.belongsTo(Character, { foreignKey: 'targetCharId', as: 'targetChar' });

// 4. 点赞关联 (Like)
User.belongsToMany(Character, { through: Like, foreignKey: 'userId', as: 'LikedChars' });
Character.belongsToMany(User, { through: Like, foreignKey: 'charId', as: 'Likers' });

// 5. 评论关联 (Comment)
User.hasMany(Comment, { foreignKey: 'userId', as: 'comments' });
Comment.belongsTo(User, { foreignKey: 'userId', as: 'author' }); // 别名 author 以便语义清晰

Character.hasMany(Comment, { foreignKey: 'charId', as: 'comments' });
Comment.belongsTo(Character, { foreignKey: 'charId', as: 'character' });

// 导出所有模型
module.exports = {
  User,
  Character,
  Story,
  LinkRequest,
  Like,
  Comment
};
