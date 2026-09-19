/* global fetch, AIDocViewers */
'use strict';

/* ============================================================
   i18n — zh-CN / en-US
   ============================================================ */
const I18N = {
  'zh-CN': {
    'brand.sub': '文档生成管理后台',
    'nav.group': '导航',
    'nav.files': '生成文件',
    'nav.templates': '内容模板',
    'nav.styles': '样式模板',
    'footer.preferences': '偏好设置',
    'footer.theme': '主题',
    'footer.language': '语言',
    'theme.system': '跟随系统',
    'theme.light': '浅色',
    'theme.dark': '深色',
    'storage.local': '本地存储',
    'storage.s3': 'S3 存储',
    'storage.unknown': '存储未知',
    'meta.supported': '支持格式',
    'meta.offline': '后台状态:异常',
    'meta.connectFail': '无法连接后台: {msg}',
    'page.files': '生成文件',
    'page.templates': '内容模板',
    'page.styles': '样式模板',
    'files.title': '生成的文档',
    'files.subtitle': '在页面上直接预览或下载已生成的文档',
    'files.searchPlaceholder': '按文件名 / 格式 / 所属用户搜索…',
    'files.refresh': '刷新',
    'files.allOwners': '全部用户',
    'files.ownerFilter': '按所属用户检索',
    'files.empty': '暂无生成文件',
    'files.prev': '上一页',
    'files.next': '下一页',
    'files.pageInfo': '第 {page} / {pages} 页',
    'files.count': '共 {total} 条',
    'files.action.owner': '分配',
    'files.transfer.title': '分配文件归属',
    'files.transfer.select': '选择用户',
    'files.transfer.optional': '或输入新的用户名(无需注册/SSO 登录过)',
    'files.transfer.customPh': '输入用户名',
    'files.transfer.assign': '分配',
    'files.transfer.success': '已分配到: {owner}',
    'files.transfer.failed': '分配失败: {msg}',
    'files.ownerSelectNone': '选择用户…',
    'files.transfer.label': '将文件分配给用户',
    'files.transfer.needOwner': '请选择用户或输入新用户名',
    'audit.title': '审计日志',
    'audit.subtitle': '记录登录、文件、模板、用户与 SSO 等操作,便于追踪',
    'audit.search': '搜索详情/目标…',
    'audit.actor': '按操作人…',
    'audit.refresh': '刷新',
    'audit.clear': '清空日志',
    'audit.allActions': '全部操作类型',
    'audit.col.time': '时间',
    'audit.col.actor': '操作人',
    'audit.col.action': '操作类型',
    'audit.col.target': '目标',
    'audit.col.detail': '详情',
    'audit.empty': '暂无审计记录',
    'audit.pageInfo': '第 {page} / {pages} 页',
    'audit.loadFailed': '加载审计日志失败: {msg}',
    'audit.clearConfirm': '确定清空全部审计日志吗?此操作不可恢复。',
    'audit.cleared': '已清空审计日志',
    'audit.clearFailed': '清空失败: {msg}',
    'audit.roleSystem': '系统',
    'audit.act.login': '登录',
    'audit.act.logout': '退出登录',
    'audit.act.auth.password': '修改密码',
    'audit.act.sso.update': 'SSO 配置修改',
    'audit.act.file.generate': '生成文件',
    'audit.act.file.delete': '删除文件',
    'audit.act.file.transfer': '转移文件归属',
    'audit.act.file.download': '下载文件',
    'audit.act.template.create': '创建模板',
    'audit.act.template.update': '更新模板',
    'audit.act.template.delete': '删除模板',
    'audit.act.styletemplate.upload': '上传样式模板',
    'audit.act.styletemplate.delete': '删除样式模板',
    'audit.act.styletemplate.default': '设置默认样式模板',
    'audit.act.user.create': '创建用户',
    'audit.act.user.delete': '删除用户',
    'audit.act.user.role': '变更用户角色',
    'audit.act.user.rename': '修改用户昵称',
    'audit.act.user.password': '重置用户密码',
    'audit.act.audit.clear': '清空审计日志',
    'files.col.name': '文件名',
    'files.col.format': '格式',
    'files.col.size': '大小',
    'files.col.time': '创建时间',
    'files.col.actions': '操作',
    'files.action.preview': '预览',
    'files.action.download': '下载',
    'files.action.delete': '删除',
    'files.deleteConfirm': '确定删除文件「{name}」吗?\n({key})',
    'files.deleted': '已删除: {name}',
    'files.deleteFailed': '删除失败: {msg}',
    'files.loadFailed': '加载文件列表失败: {msg}',
    'tpl.title': '模板库',
    'tpl.subtitle': '管理文档内容模板,基于 JSON 定义文档结构、一键生成',
    'tpl.new': '新建模板',
    'tpl.empty': '暂无模板',
    'tpl.namePlaceholder': '模板名称',
    'tpl.descPlaceholder': '模板描述(可选)',
    'tpl.save': '保存模板',
    'tpl.generate': '生成文档',
    'tpl.delete': '删除',
    'tpl.example': '载入示例',
    'tpl.format': '格式化',
    'tpl.validate': '校验',
    'tpl.inputLabel': '输入 JSON(结构化文档内容)',
    'tpl.styleLabel': '套用样式模板',
    'tpl.styleNone': '（不使用）',
    'tpl.styleUnset': '未套用样式模板',
    'tpl.styleApplied': '已套用: {name}',
    'tpl.styleFallback': '未单独选择 → 将使用当前默认: {name}',
    'tpl.newStatus': '新模板(未保存)',
    'tpl.saved': '已保存 ✓',
    'tpl.saveToast': '模板已保存',
    'tpl.saveFailed': '保存失败: {msg}',
    'tpl.loadFailed': '加载模板失败: {msg}',
    'tpl.jsonError': 'JSON 语法错误: {msg}',
    'tpl.jsonOk': 'JSON 语法正确',
    'tpl.formatted': '已格式化',
    'tpl.exampleLoaded': '已载入示例',
    'tpl.deleteConfirm': '确定删除该模板吗?',
    'tpl.deleted': '模板已删除',
    'tpl.deleteFailed': '删除失败: {msg}',
    'tpl.generating': '生成中…',
    'tpl.genOk': '生成成功 ✓',
    'tpl.genFailed': '生成失败',
    'tpl.genTitleOk': '生成成功:{fmt}',
    'tpl.genTitleErr': '生成失败',
    'tpl.genName': '文件名:{name} · 大小:{size}',
    'tpl.genLink': '链接:',
    'tpl.genDownload': '下载',
    'styles.title': '样式模板',
    'styles.subtitle': '上传真实文档作为版式模板,生成同格式文档时自动套用其主题与样式',
    'styles.refresh': '刷新',
    'styles.namePlaceholder': '模板名称(可选)',
    'styles.chooseFile': '选择要上传的文件…',
    'styles.upload': '上传样式模板',
    'styles.tip': '「当前使用」即该格式下默认套用的样式模板。同一格式可上传多个模板,点击「设为当前」切换;也可在内容模板里单独指定。',
    'styles.empty': '暂无样式模板',
    'styles.col.name': '名称',
    'styles.col.format': '格式',
    'styles.col.current': '当前使用',
    'styles.col.filename': '文件名',
    'styles.col.size': '大小',
    'styles.col.actions': '操作',
    'styles.current': '← 当前使用',
    'styles.setCurrent': '设为当前',
    'styles.setSystemDefault': '设为系统默认',
    'styles.setMyDefault': '设为我的默认',
    'styles.editing': '编辑中',
    'styles.selectFile': '请选择文件',
    'styles.unsupportedType': '不支持的文件类型: {name}。仅支持 .pptx / .docx / .xlsx',
    'styles.uploadOk': '上传成功',
    'styles.uploadFailed': '上传失败: {msg}',
    'styles.loadFailed': '加载样式模板失败: {msg}',
    'styles.detect': '识别格式: {fmt}',
    'styles.deleteConfirm': '确定删除该样式模板吗?',
    'styles.deleteOk': '样式模板已删除',
    'styles.deleteFailed': '删除失败: {msg}',
    'styles.setDefaultOk': '已设为当前使用',
    'styles.setDefaultFailed': '设置失败: {msg}',
    'fmt.docx': 'Word (.docx)',
    'fmt.pdf': 'PDF',
    'fmt.xlsx': 'Excel (.xlsx)',
    'fmt.pptx': 'PowerPoint (.pptx)',
    'fmt.other': '其他',
    'modal.close': '关闭',
    'preview.loading': '正在加载预览…',
    'preview.retry': '重试',
    'preview.download': '下载',
    'preview.openUrl': '在新标签页打开',
    'preview.rerender': '重新渲染',
    'preview.notBundle': '预览组件未成功加载,请访问下载链接使用本地应用打开。',
    'preview.fetchFail': '加载文件失败: {msg}',
    'preview.renderFail': '渲染失败: {msg}',
    'preview.unsupported': '该文件类型不支持在线预览。',
    'preview.sheets': '工作表:',
    'preview.pages': '共 {n} 页',
    'preview.info.name': '文件名',
    'preview.info.format': '格式',
    'preview.info.size': '大小',
    'preview.info.time': '创建时间',
    'preview.info.key': '存储 Key',
    'preview.info.url': '公开链接',
    'login.title': '登录 AI-Doc 管理后台',
    'login.subtitle': '本地账号登录,或使用 SSO 单点登录',
    'login.username': '用户名',
    'login.password': '密码',
    'login.submit': '登 录',
    'login.sso': '使用 SSO 登录',
    'login.error': '登录失败: {msg}',
    'login.required': '请输入用户名和密码',
    'login.ssoError': 'SSO 登录失败: {msg}',
    'login.foot': '当前用户已登录',
    'nav.users': '用户管理',
    'nav.sso': 'SSO 登录',
    'nav.audit': '审计日志',
    'page.users': '用户管理',
    'page.sso': 'SSO 登录',
    'page.audit': '审计日志',
    'files.owner': '归属',
    'files.ownerSystem': '系统',
    'files.ownerMe': '我',
    'users.refresh': '刷新',
    'users.title': '用户管理',
    'users.subtitle': '管理系统账号与角色,并可重置密码',
    'users.add': '新增用户',
    'users.empty': '暂无用户',
    'users.col.username': '用户名',
    'users.col.displayName': '显示名',
    'users.col.role': '角色',
    'users.col.origin': '来源',
    'users.col.createdAt': '创建时间',
    'users.col.actions': '操作',
    'users.role.admin': '管理员',
    'users.role.user': '普通用户',
    'users.origin.local': '本地账号',
    'users.origin.sso': 'SSO 账号',
    'users.newTitle': '新增用户',
    'users.usernamePh': '用户名',
    'users.passwordPh': '初始密码(至少6位)',
    'users.displayNamePh': '显示名(可选)',
    'users.create': '创建',
    'users.created': '用户已创建',
    'users.createFailed': '创建失败: {msg}',
    'users.loadFailed': '加载用户失败: {msg}',
    'users.setAdmin': '设为管理员',
    'users.setUser': '设为普通用户',
    'users.roleUpdated': '角色已更新',
    'users.roleFailed': '更新角色失败: {msg}',
    'users.resetPwd': '重置密码',
    'users.resetPwdTitle': '重置密码 - {name}',
    'users.resetPwdPh': '新密码(至少6位)',
    'users.delete': '删除',
    'users.pwdUpdated': '密码已重置',
    'users.pwdFailed': '重置密码失败: {msg}',
    'users.deleteConfirm': '确定删除用户「{name}」吗?',
    'users.deleted': '用户已删除',
    'users.deleteFailed': '删除失败: {msg}',
    'sso.title': 'SSO 单点登录',
    'sso.subtitle': '界面化配置 OIDC / SAML / CAS 身份提供商',
    'sso.enabled': '启用 SSO',
    'sso.provider': '协议类型',
    'sso.providerNone': '不启用',
    'sso.providerOidc': 'OIDC / OAuth2',
    'sso.providerSaml': 'SAML 2.0',
    'sso.providerCas': 'CAS',
    'sso.autoCreate': '首次 SSO 登录自动创建账号',
    'sso.baseUrl': '回调基地址 (Callback Base URL)',
    'sso.baseUrlPh': '留空则自动使用当前访问地址',
    'sso.adminUsernames': 'SSO 管理员用户名(逗号分隔)',
    'sso.metadataUrl': 'IdP 元数据 URL (仅 SAML)',
    'sso.metadataUrlPh': 'https://idp.example.com/metadata',
    'sso.loadMetadata': '获取元数据',
    'sso.save': '保存配置',
    'sso.saved': '配置已保存',
    'sso.saveFailed': '保存失败: {msg}',
    'sso.test': '测试连接',
    'sso.testing': '测试中…',
    'sso.testOk': '连接成功(已生成登录跳转地址)',
    'sso.testFailed': '连接失败: {msg}',
    'sso.metaLoaded': '已从元数据获取配置',
    'sso.metaFailed': '获取元数据失败: {msg}',
    'sso.status.enabled': '已启用',
    'sso.status.disabled': '未启用',
    'sso.status.provider': '当前协议: {p}',
    'sso.status.configured': '配置完好',
    'sso.status.needConfig': '配置不完整: {errs}',
    'sso.callbackHint': '回调地址: {url}',
    'account.changePwd': '修改密码',
    'account.oldPwd': '当前密码',
    'account.newPwd': '新密码',
    'account.confirmPwd': '确认新密码',
    'account.save': '保存',
    'account.logout': '退出登录',
    'account.pwdMismatch': '两次输入的新密码不一致',
    'account.pwdUpdated': '密码已修改',
    'account.pwdFailed': '修改失败: {msg}',
    'styles.asSystem': '作为系统模板(管理员)',
    'styles.ownerCol': '归属',
    'styles.ownerSystem': '系统',
    'styles.ownerMine': '我的',
    'styles.setMyDefault': '设为我的默认',
    'styles.systemDefault': '系统默认',
    'styles.myDefault': '我的默认',
  },
  'en-US': {
    'brand.sub': 'Document Generation Console',
    'nav.group': 'Navigation',
    'nav.files': 'Generated Files',
    'nav.templates': 'Content Templates',
    'nav.styles': 'Style Templates',
    'footer.preferences': 'Preferences',
    'footer.theme': 'Theme',
    'footer.language': 'Language',
    'theme.system': 'System',
    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'storage.local': 'Local storage',
    'storage.s3': 'S3 storage',
    'storage.unknown': 'Storage unknown',
    'meta.supported': 'Formats',
    'meta.offline': 'Backend offline',
    'meta.connectFail': 'Cannot reach backend: {msg}',
    'page.files': 'Generated Files',
    'page.templates': 'Content Templates',
    'page.styles': 'Style Templates',
    'files.title': 'Generated Documents',
    'files.subtitle': 'Preview or download generated documents right in the page',
    'files.searchPlaceholder': 'Search by name / format / owner…',
    'files.refresh': 'Refresh',
    'files.allOwners': 'All users',
    'files.ownerFilter': 'Filter by owner',
    'files.empty': 'No generated files yet',
    'files.prev': 'Previous',
    'files.next': 'Next',
    'files.pageInfo': 'Page {page} / {pages}',
    'files.count': '{total} items',
    'files.action.owner': 'Transfer',
    'files.transfer.title': 'Transfer File Ownership',
    'files.transfer.select': 'Select user',
    'files.transfer.optional': 'Or type a new username (no registration / SSO login needed)',
    'files.transfer.customPh': 'Enter username',
    'files.transfer.assign': 'Assign',
    'files.transfer.success': 'Transferred to: {owner}',
    'files.transfer.failed': 'Transfer failed: {msg}',
    'files.ownerSelectNone': 'Select a user…',
    'files.transfer.label': 'Transfer file to a user',
    'files.transfer.needOwner': 'Select a user or enter a new username',
    'audit.title': 'Audit Log',
    'audit.subtitle': 'Track logins, files, templates, users and SSO operations',
    'audit.search': 'Search detail / target…',
    'audit.actor': 'By actor…',
    'audit.refresh': 'Refresh',
    'audit.clear': 'Clear log',
    'audit.allActions': 'All actions',
    'audit.col.time': 'Time',
    'audit.col.actor': 'Actor',
    'audit.col.action': 'Action',
    'audit.col.target': 'Target',
    'audit.col.detail': 'Detail',
    'audit.empty': 'No audit records yet',
    'audit.pageInfo': 'Page {page} / {pages}',
    'audit.loadFailed': 'Failed to load audit log: {msg}',
    'audit.clearConfirm': 'Clear ALL audit logs? This cannot be undone.',
    'audit.cleared': 'Audit log cleared',
    'audit.clearFailed': 'Clear failed: {msg}',
    'audit.roleSystem': 'System',
    'audit.act.login': 'Login',
    'audit.act.logout': 'Logout',
    'audit.act.auth.password': 'Change password',
    'audit.act.sso.update': 'SSO config update',
    'audit.act.file.generate': 'Generate file',
    'audit.act.file.delete': 'Delete file',
    'audit.act.file.transfer': 'Transfer file',
    'audit.act.file.download': 'Download file',
    'audit.act.template.create': 'Create template',
    'audit.act.template.update': 'Update template',
    'audit.act.template.delete': 'Delete template',
    'audit.act.styletemplate.upload': 'Upload style template',
    'audit.act.styletemplate.delete': 'Delete style template',
    'audit.act.styletemplate.default': 'Set default style template',
    'audit.act.user.create': 'Create user',
    'audit.act.user.delete': 'Delete user',
    'audit.act.user.role': 'Change user role',
    'audit.act.user.rename': 'Rename user',
    'audit.act.user.password': 'Reset user password',
    'audit.act.audit.clear': 'Clear audit log',
    'files.col.name': 'File Name',
    'files.col.format': 'Format',
    'files.col.size': 'Size',
    'files.col.time': 'Created At',
    'files.col.actions': 'Actions',
    'files.action.preview': 'Preview',
    'files.action.download': 'Download',
    'files.action.delete': 'Delete',
    'files.deleteConfirm': 'Delete file "{name}"?\n({key})',
    'files.deleted': 'Deleted: {name}',
    'files.deleteFailed': 'Delete failed: {msg}',
    'files.loadFailed': 'Failed to load files: {msg}',
    'tpl.title': 'Template Library',
    'tpl.subtitle': 'Manage content templates — define document structure with JSON and generate in one click',
    'tpl.new': 'New Template',
    'tpl.empty': 'No templates yet',
    'tpl.namePlaceholder': 'Template name',
    'tpl.descPlaceholder': 'Description (optional)',
    'tpl.save': 'Save Template',
    'tpl.generate': 'Generate',
    'tpl.delete': 'Delete',
    'tpl.example': 'Load Example',
    'tpl.format': 'Format',
    'tpl.validate': 'Validate',
    'tpl.inputLabel': 'Enter JSON (structured document content)',
    'tpl.styleLabel': 'Apply style template',
    'tpl.styleNone': '（none）',
    'tpl.styleUnset': 'No style template',
    'tpl.styleApplied': 'Applied: {name}',
    'tpl.styleFallback': 'Not set → will use default: {name}',
    'tpl.newStatus': 'New template (unsaved)',
    'tpl.saved': 'Saved ✓',
    'tpl.saveToast': 'Template saved',
    'tpl.saveFailed': 'Save failed: {msg}',
    'tpl.loadFailed': 'Failed to load templates: {msg}',
    'tpl.jsonError': 'JSON syntax error: {msg}',
    'tpl.jsonOk': 'JSON syntax is valid',
    'tpl.formatted': 'Formatted',
    'tpl.exampleLoaded': 'Example loaded',
    'tpl.deleteConfirm': 'Delete this template?',
    'tpl.deleted': 'Template deleted',
    'tpl.deleteFailed': 'Delete failed: {msg}',
    'tpl.generating': 'Generating…',
    'tpl.genOk': 'Generated ✓',
    'tpl.genFailed': 'Generation failed',
    'tpl.genTitleOk': 'Generated:{fmt}',
    'tpl.genTitleErr': 'Generation failed',
    'tpl.genName': 'File:{name} · Size:{size}',
    'tpl.genLink': 'Link:',
    'tpl.genDownload': 'Download',
    'styles.title': 'Style Templates',
    'styles.subtitle': 'Upload real document files to use as layout templates — apply their theme when generating the same format',
    'styles.refresh': 'Refresh',
    'styles.namePlaceholder': 'Name (optional)',
    'styles.chooseFile': 'Choose a file to upload…',
    'styles.upload': 'Upload Style Template',
    'styles.tip': '"In use" means the default style template for that format. You can upload multiple templates per format and switch by clicking "Make default"; or assign one per content template.',
    'styles.empty': 'No style templates yet',
    'styles.col.name': 'Name',
    'styles.col.format': 'Format',
    'styles.col.current': 'In Use',
    'styles.col.filename': 'File Name',
    'styles.col.size': 'Size',
    'styles.col.actions': 'Actions',
    'styles.current': '← In use',
    'styles.setCurrent': 'Make default',
    'styles.setSystemDefault': 'Set as system default',
    'styles.setMyDefault': 'Set as my default',
    'styles.editing': 'editing',
    'styles.selectFile': 'Please choose a file',
    'styles.unsupportedType': 'Unsupported file type: {name}. Only .pptx / .docx / .xlsx',
    'styles.uploadOk': 'Uploaded',
    'styles.uploadFailed': 'Upload failed: {msg}',
    'styles.loadFailed': 'Failed to load style templates: {msg}',
    'styles.detect': 'Detected: {fmt}',
    'styles.deleteConfirm': 'Delete this style template?',
    'styles.deleteOk': 'Style template deleted',
    'styles.deleteFailed': 'Delete failed: {msg}',
    'styles.setDefaultOk': 'Now the default',
    'styles.setDefaultFailed': 'Setting failed: {msg}',
    'fmt.docx': 'Word (.docx)',
    'fmt.pdf': 'PDF',
    'fmt.xlsx': 'Excel (.xlsx)',
    'fmt.pptx': 'PowerPoint (.pptx)',
    'fmt.other': 'Other',
    'modal.close': 'Close',
    'preview.loading': 'Loading preview…',
    'preview.retry': 'Retry',
    'preview.download': 'Download',
    'preview.openUrl': 'Open in new tab',
    'preview.rerender': 'Rerender',
    'preview.notBundle': 'Preview component is not available. Please use the download link and open with a local application.',
    'preview.fetchFail': 'Failed to load file: {msg}',
    'preview.renderFail': 'Rendering failed: {msg}',
    'preview.unsupported': 'This file type cannot be previewed online.',
    'preview.sheets': 'Sheets:',
    'preview.pages': '{n} page(s)',
    'preview.info.name': 'File Name',
    'preview.info.format': 'Format',
    'preview.info.size': 'Size',
    'preview.info.time': 'Created At',
    'preview.info.key': 'Storage Key',
    'preview.info.url': 'Public Link',
    'login.title': 'Sign in to AI-Doc Console',
    'login.subtitle': 'Local account or SSO single sign-on',
    'login.username': 'Username',
    'login.password': 'Password',
    'login.submit': 'Sign in',
    'login.sso': 'Sign in with SSO',
    'login.error': 'Login failed: {msg}',
    'login.required': 'Enter username and password',
    'login.ssoError': 'SSO login failed: {msg}',
    'login.foot': 'A user is already signed in',
    'nav.users': 'Users',
    'nav.sso': 'SSO Login',
    'nav.audit': 'Audit Log',
    'page.users': 'Users',
    'page.sso': 'SSO Login',
    'page.audit': 'Audit Log',
    'files.owner': 'Owner',
    'files.ownerSystem': 'System',
    'files.ownerMe': 'Me',
    'users.refresh': 'Refresh',
    'users.title': 'User Management',
    'users.subtitle': 'Manage accounts, roles and reset passwords',
    'users.add': 'Add User',
    'users.empty': 'No users yet',
    'users.col.username': 'Username',
    'users.col.displayName': 'Display Name',
    'users.col.role': 'Role',
    'users.col.origin': 'Origin',
    'users.col.createdAt': 'Created At',
    'users.col.actions': 'Actions',
    'users.role.admin': 'Admin',
    'users.role.user': 'User',
    'users.origin.local': 'Local',
    'users.origin.sso': 'SSO',
    'users.newTitle': 'Add User',
    'users.usernamePh': 'Username',
    'users.passwordPh': 'Initial password (min 6 chars)',
    'users.displayNamePh': 'Display name (optional)',
    'users.create': 'Create',
    'users.created': 'User created',
    'users.createFailed': 'Failed to create: {msg}',
    'users.loadFailed': 'Failed to load users: {msg}',
    'users.setAdmin': 'Make admin',
    'users.setUser': 'Make user',
    'users.roleUpdated': 'Role updated',
    'users.roleFailed': 'Failed to update role: {msg}',
    'users.resetPwd': 'Reset password',
    'users.resetPwdTitle': 'Reset password - {name}',
    'users.resetPwdPh': 'New password (min 6 chars)',
    'users.delete': 'Delete',
    'users.pwdUpdated': 'Password reset',
    'users.pwdFailed': 'Failed to reset password: {msg}',
    'users.deleteConfirm': 'Delete user "{name}"?',
    'users.deleted': 'User deleted',
    'users.deleteFailed': 'Delete failed: {msg}',
    'sso.title': 'SSO Single Sign-on',
    'sso.subtitle': 'Configure OIDC / SAML / CAS providers in the UI',
    'sso.enabled': 'Enable SSO',
    'sso.provider': 'Protocol',
    'sso.providerNone': 'Disabled',
    'sso.providerOidc': 'OIDC / OAuth2',
    'sso.providerSaml': 'SAML 2.0',
    'sso.providerCas': 'CAS',
    'sso.autoCreate': 'Auto-create account on first SSO login',
    'sso.baseUrl': 'Callback base URL',
    'sso.baseUrlPh': 'Leave empty to use the current access URL',
    'sso.adminUsernames': 'SSO admin usernames (comma separated)',
    'sso.metadataUrl': 'IdP metadata URL (SAML only)',
    'sso.metadataUrlPh': 'https://idp.example.com/metadata',
    'sso.loadMetadata': 'Fetch metadata',
    'sso.save': 'Save Config',
    'sso.saved': 'Config saved',
    'sso.saveFailed': 'Save failed: {msg}',
    'sso.test': 'Test connection',
    'sso.testing': 'Testing…',
    'sso.testOk': 'Connection OK (login redirect generated)',
    'sso.testFailed': 'Connection failed: {msg}',
    'sso.metaLoaded': 'Config populated from metadata',
    'sso.metaFailed': 'Failed to fetch metadata: {msg}',
    'sso.status.enabled': 'Enabled',
    'sso.status.disabled': 'Disabled',
    'sso.status.provider': 'Current protocol: {p}',
    'sso.status.configured': 'Config OK',
    'sso.status.needConfig': 'Config incomplete: {errs}',
    'sso.callbackHint': 'Callback URL: {url}',
    'account.changePwd': 'Change Password',
    'account.oldPwd': 'Current password',
    'account.newPwd': 'New password',
    'account.confirmPwd': 'Confirm new password',
    'account.save': 'Save',
    'account.logout': 'Sign out',
    'account.pwdMismatch': 'The new passwords do not match',
    'account.pwdUpdated': 'Password changed',
    'account.pwdFailed': 'Change failed: {msg}',
    'styles.asSystem': 'Upload as system template (admin)',
    'styles.ownerCol': 'Owner',
    'styles.ownerSystem': 'System',
    'styles.ownerMine': 'Mine',
    'styles.setMyDefault': 'Set as my default',
    'styles.systemDefault': 'System default',
    'styles.myDefault': 'My default',
  },
};

let lang = localStorage.getItem('aidoc-lang') || (navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en-US');
if (!I18N[lang]) lang = 'zh-CN';

function t(path, vars) {
  const dict = I18N[lang] || I18N['zh-CN'];
  let val = dict[path];
  if (val === undefined || val === null) {
    val = path.split('.').reduce((o, k) => (o == null ? o : o[k]), dict);
  }
  let s = val === undefined || val === null ? path : String(val);
  if (vars) {
    for (const [k, v] of Object.entries(vars)) s = s.split('{' + k + '}').join(String(v));
  }
  return s;
}

/* ============================================================
   Theme
   ============================================================ */
const getThemePref = () => localStorage.getItem('aidoc-theme') || 'system';
const setThemePref = (v) => localStorage.setItem('aidoc-theme', v);
const mqDark = window.matchMedia('(prefers-color-scheme: dark)');

function resolveTheme() {
  const pref = getThemePref();
  return pref === 'system' ? (mqDark.matches ? 'dark' : 'light') : pref;
}

function applyTheme() {
  document.body.dataset.theme = resolveTheme();
  const sel = document.getElementById('themeSelect');
  if (sel) sel.value = getThemePref();
}
mqDark.addEventListener('change', () => { if (getThemePref() === 'system') applyTheme(); });

/* ============================================================
   State & helpers
   ============================================================ */
const state = {
  meta: null,
  files: [],
  filesPage: { page: 1, limit: 20, total: 0, pages: 1, owners: [] },
  audit: [],
  auditPage: { page: 1, limit: 20, total: 0, pages: 1, actions: [] },
  templates: [],
  styleTemplates: [],
  styleDefaults: {},
  styleSystemDefaults: {},
  styleOwnDefaults: {},
  currentTemplateId: null,
  preview: null,
  user: null,
  ssoStatus: null,
  users: [],
};

const isAdminUser = () => !!(state.user && state.user.role === 'admin');

const $ = (sel) => document.querySelector(sel);

const EXAMPLES = {
  docx: {
    title: '工作周报',
    author: '示例用户',
    paragraphs: [
      { text: '本周完成事项', level: 1 },
      { text: '完成 AI 文档生成平台的部署与联调', bullet: true },
      { text: '修复导出 PDF 的排版问题', bullet: true },
      { text: '下周计划', level: 1 },
      { text: '接入 Dify 工作流,并完善模板库', bullet: true },
    ],
    footer: '由 AI-Doc 生成',
  },
  pdf: {
    title: '项目汇报',
    author: '示例用户',
    paragraphs: [
      { text: '项目概述', level: 1 },
      { text: '本项目通过 MCP 协议为 AI Agent 提供文档生成能力。' },
      { text: '交付指标', level: 1 },
    ],
    tables: [
      {
        columns: [
          { key: 'item', header: '指标' },
          { key: 'value', header: '目标' },
        ],
        rows: [
          { item: '文档格式', value: 'docx / pdf / xlsx / pptx' },
          { item: '上线日期', value: '2026-09-01' },
        ],
      },
    ],
  },
  xlsx: {
    title: '月度销售数据',
    sheets: [
      {
        name: '销售明细',
        columns: [
          { key: 'month', header: '月份' },
          { key: 'revenue', header: '收入(元)' },
          { key: 'goal', header: '目标(元)' },
        ],
        rows: [
          { month: '1月', revenue: 120000, goal: 100000 },
          { month: '2月', revenue: 156000, goal: 110000 },
        ],
      },
    ],
  },
  pptx: {
    title: '项目启动会',
    author: '示例用户',
    slides: [
      { title: '项目启动会', subtitle: 'AI-Doc 文档生成平台', layout: 'title' },
      { title: '项目背景', bullets: ['统一文档生成能力', '向 AI Agent 开放能力'], layout: 'title_content' },
      { title: '后续计划', bullets: ['MCP 接入', '模板定制与模板库建设'], layout: 'title_content' },
    ],
  },
};

const PAGES = { files: 'page.files', templates: 'page.templates', styles: 'page.styles', users: 'page.users', sso: 'page.sso', audit: 'page.audit' };

function fmtBytes(n) {
  if (n == null) return '-';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  return d.toLocaleString(lang === 'zh-CN' ? 'zh-CN' : 'en-US', { hour12: false });
}

function formatBadge(format) {
  const f = format || 'other';
  return '<span class="format-badge ' + f + '">' + f.toUpperCase() + '</span>';
}

function formatLabel(fmt) {
  return t(I18N[lang] && I18N[lang]['fmt.' + fmt] ? 'fmt.' + fmt : 'fmt.other');
}

function toast(msg, type = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2600);
}

async function api(path, options = {}) {
  const opts = { headers: {}, ...options };
  if (opts.body && typeof opts.body !== 'string') {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* no json */ }
  if (!res.ok) {
    const msg = (data && (data.error || data.details)) || ('HTTP ' + res.status);
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

/* ============================================================
   Auth / account / SSO / users
   ============================================================ */
function showLoginScreen() {
  $('#loginView').classList.remove('hidden');
  $('#appView').classList.add('app-hidden');
  const sso = state.ssoStatus;
  $('#loginSso').classList.toggle('hidden', !(sso && sso.enabled));
}

function enterApp(user) {
  state.user = user;
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('app-hidden');
  renderUserChip();
  renderAdminUI();
  loadMeta();
  refreshFiles();
  loadStyleOptions();
}

function renderUserChip() {
  const user = state.user;
  if (!user) return;
  const name = user.displayName || user.username;
  $('#userName').textContent = name;
  $('#userRole').textContent = user.role === 'admin' ? t('users.role.admin') : t('users.role.user');
  $('#userAvatar').textContent = (name || 'A').charAt(0).toUpperCase();
  document.title = 'AI-Doc — ' + name;
}

function renderAdminUI() {
  const admin = isAdminUser();
  document.querySelectorAll('[data-admin-only]').forEach((el) => el.classList.toggle('hidden', !admin));
  // content-template write actions are admin-only
  ['tplNew', 'tplSave', 'tplDelete'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !admin);
  });
  const asSystem = $('#styleAsSystemWrap');
  if (asSystem) asSystem.classList.toggle('hidden', !admin);
}

async function tryLogin(e) {
  e.preventDefault();
  e.stopPropagation();
  const username = $('#loginUser').value.trim();
  const password = $('#loginPass').value;
  const err = $('#loginError');
  if (!username || !password) {
    err.textContent = t('login.required');
    err.classList.remove('hidden');
    return;
  }
  try {
    const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
    err.classList.add('hidden');
    enterApp(data.user);
  } catch (err2) {
    err.textContent = t('login.error', { msg: err2.message });
    err.classList.remove('hidden');
  }
}

function ssoLogin() {
  const relay = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.href = '/login/sso?relay=' + relay;
}

async function doLogout() {
  try { await api('/api/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  window.location.reload();
}

function openPwdModal() {
  $('#pwdOld').value = ''; $('#pwdNew').value = ''; $('#pwdConfirm').value = '';
  $('#pwdError').classList.add('hidden');
  $('#pwdModal').classList.remove('hidden');
}

function closePwdModal() {
  $('#pwdModal').classList.add('hidden');
}

async function savePassword() {
  const oldP = $('#pwdOld').value;
  const p1 = $('#pwdNew').value;
  const p2 = $('#pwdConfirm').value;
  const err = $('#pwdError');
  if (p1 !== p2) {
    err.textContent = t('account.pwdMismatch');
    err.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/auth/password', { method: 'POST', body: { oldPassword: oldP, newPassword: p1 } });
    toast(t('account.pwdUpdated'), 'ok');
    closePwdModal();
  } catch (err2) {
    err.textContent = t('account.pwdFailed', { msg: err2.message });
    err.classList.remove('hidden');
  }
}

/* ---- users (admin) ---- */
async function refreshUsers() {
  try {
    const data = await api('/api/users');
    state.users = data.users || [];
    renderUsers();
  } catch (err) {
    toast(t('users.loadFailed', { msg: err.message }), 'err');
  }
}

function renderUsers() {
  const rows = $('#userRows');
  if (!rows) return;
  $('#userEmpty').classList.toggle('hidden', state.users.length > 0);
  rows.innerHTML = state.users.map((u) => {
    const roleLabel = u.role === 'admin' ? t('users.role.admin') : t('users.role.user');
    const originLabel = u.origin === 'sso' ? t('users.origin.sso') : t('users.origin.local');
    const roleBadge = u.role === 'admin' ? '<span class="badge-role admin">' + escapeHtml(roleLabel) + '</span>'
      : '<span class="badge-role">' + escapeHtml(roleLabel) + '</span>';
    const originBadge = u.origin === 'sso'
      ? '<span class="badge-origin sso">' + escapeHtml(originLabel) + '</span>'
      : '<span class="badge-origin">' + escapeHtml(originLabel) + '</span>';
    const canEdit = !(state.user && state.user.username === u.username && u.role === 'admin');
    const actions = canEdit
      ? '<button class="icon-btn" data-ua="toggle" data-u="' + escapeAttr(u.username) + '" data-r="' + (u.role === 'admin' ? 'user' : 'admin') + '" title="' + (u.role === 'admin' ? escapeAttr(t('users.setUser')) : escapeAttr(t('users.setAdmin'))) + '">' + (u.role === 'admin' ? escapeHtml(t('users.setUser')) : escapeHtml(t('users.setAdmin'))) + '</button>'
        + '<button class="icon-btn" data-ua="pwd" data-u="' + escapeAttr(u.username) + '" data-n="' + escapeAttr(u.displayName || u.username) + '">' + t('users.resetPwd') + '</button>'
        + '<button class="icon-btn danger" data-ua="del" data-u="' + escapeAttr(u.username) + '" data-n="' + escapeAttr(u.displayName || u.username) + '">' + t('users.delete') + '</button>'
      : '<span class="muted small">' + escapeHtml(t('users.origin.local')) + '</span>';
    return '<tr>'
      + '<td><strong>' + escapeHtml(u.username) + '</strong></td>'
      + '<td>' + escapeHtml(u.displayName || '-') + '</td>'
      + '<td>' + roleBadge + '</td>'
      + '<td>' + originBadge + '</td>'
      + '<td class="muted">' + fmtTime(u.createdAt) + '</td>'
      + '<td class="td-right">' + actions + '</td></tr>';
  }).join('');
}

function openNewUserModal() {
  const username = window.prompt(t('users.usernamePh'));
  if (username === null) return;
  const password = window.prompt(t('users.passwordPh'));
  if (password === null) return;
  const role = window.confirm(t('users.setAdmin')) ? 'admin' : 'user';
  createUser(username, password, role);
}

async function createUser(username, password, role) {
  try {
    await api('/api/users', { method: 'POST', body: { username, password, role, displayName: username } });
    toast(t('users.created'), 'ok');
    refreshUsers();
  } catch (err) {
    toast(t('users.createFailed', { msg: err.message }), 'err');
  }
}

async function userTableClick(e) {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const uname = btn.dataset.u;
  const action = btn.dataset.ua;
  try {
    if (action === 'toggle') {
      await api('/api/users/' + encodeURIComponent(uname) + '/role', { method: 'PUT', body: { role: btn.dataset.r } });
      toast(t('users.roleUpdated'), 'ok');
      refreshUsers();
    } else if (action === 'pwd') {
      const newPwd = window.prompt(t('users.resetPwdTitle', { name: btn.dataset.n }));
      if (newPwd === null) return;
      await api('/api/users/' + encodeURIComponent(uname) + '/password', { method: 'PUT', body: { password: newPwd } });
      toast(t('users.pwdUpdated'), 'ok');
    } else if (action === 'del') {
      if (!window.confirm(t('users.deleteConfirm', { name: btn.dataset.n }))) return;
      await api('/api/users/' + encodeURIComponent(uname), { method: 'DELETE' });
      toast(t('users.deleted'), 'ok');
      refreshUsers();
    }
  } catch (err) {
    toast(err.message, 'err');
  }
}

/* ---- SSO config (admin) ---- */
async function loadSsoConfig() {
  try {
    const data = await api('/api/auth/sso-config');
    state.ssoConfig = data.config;
    state.ssoFields = data.fields || {};
    renderSsoStatus();
    renderSsoFields();
  } catch (err) {
    toast(err.message, 'err');
  }
}

function renderSsoStatus() {
  const sso = state.ssoStatus;
  const bar = $('#ssoStatusBar');
  if (!bar || !sso) return;
  const provider = sso.provider !== 'none' ? t('sso.provider' + (sso.provider === 'oidc' ? 'Oidc' : sso.provider === 'saml' ? 'Saml' : 'Cas') || '') : t('sso.providerNone');
  const cls = sso.enabled ? (sso.configured ? 'ok' : 'warn') : 'off';
  const statusText = sso.enabled
    ? (sso.configured ? t('sso.status.configured') : t('sso.status.needConfig', { errs: (sso.errors || []).join('；') }))
    : t('sso.status.disabled');
  bar.classList.add(cls);
  bar.innerHTML = '<div><span class="sso-dot"></span><strong>' + (sso.enabled ? t('sso.status.enabled') : t('sso.status.disabled')) + '</strong>'
    + ' · ' + escapeHtml(statusText)
    + (sso.provider !== 'none' ? ' · ' + escapeHtml(t('sso.status.provider', { p: provider })) : '')
    + '</div>';
}

function renderSsoFields() {
  const cfg = state.ssoConfig;
  if (!cfg) return;
  $('#ssoEnabled').checked = !!cfg.enabled;
  $('#ssoAutoCreate').checked = !!cfg.autoCreate;
  $('#ssoProvider').value = cfg.provider || 'none';
  $('#ssoBaseUrl').value = cfg.baseUrl || '';
  $('#ssoAdminUsernames').value = (cfg.adminUsernames || []).join(', ');
  renderSsoProviderFields();
}

function renderSsoProviderFields() {
  const cfg = state.ssoConfig;
  if (!cfg) return;
  const provider = $('#ssoProvider').value || 'none';
  $('#ssoMetaFetch').classList.toggle('hidden', provider !== 'saml');
  const fields = (state.ssoFields || {})[provider] || [];
  const container = $('#ssoFields');
  container.innerHTML = fields.map((f) => {
    if (f.isCallbackHint) {
      const base = (cfg.baseUrl && cfg.baseUrl.trim()) ? cfg.baseUrl.trim() : window.location.origin;
      const url = base.replace(/\/+$/, '') + '/callback/' + provider;
      return '<div class="field callback-hint"><span class="field-label">' + escapeHtml(f.label) + '</span>'
        + '<code>' + escapeHtml(url) + '</code>'
        + (f.help ? '<span class="field-help">' + escapeHtml(f.help) + '</span>' : '')
        + '</div>';
    }
    const value = cfg[provider] ? (cfg[provider][f.key] !== undefined ? cfg[provider][f.key] : '') : '';
    if (f.type === 'checkbox') {
      return '<label class="field"><span class="field-label">' + escapeHtml(f.label) + '</span>'
        + '<label class="switch"><input type="checkbox" data-sso-k="' + escapeAttr(f.key) + '" ' + (value ? 'checked' : '') + ' /><span class="switch-slider"></span></label></label>';
    }
    const tag = f.type === 'textarea' ? 'textarea' : 'input';
    const typeAttr = f.type === 'password' ? 'type="password"' : 'type="text"';
    return '<label class="field grow"><span class="field-label">' + escapeHtml(f.label) + '</span>'
      + '<' + tag + ' ' + typeAttr + ' class="input" data-sso-k="' + escapeAttr(f.key) + '" value="' + (f.type === 'textarea' ? '' : escapeAttr(String(value))) + '"'
      + (f.placeholder ? ' placeholder="' + escapeAttr(f.placeholder) + '"' : '') + '>'
      + (f.type === 'textarea' ? escapeHtml(String(value)) : '')
      + (tag === 'textarea' ? '</textarea>' : '')
      + (f.help ? '<span class="field-help">' + escapeHtml(f.help) + '</span>' : '')
      + '</label>';
  }).join('');
  $('#ssoMsg').textContent = '';
  $('#ssoMsg').className = 'editor-status';
}

function collectSsoConfig() {
  const cfg = state.ssoConfig;
  const provider = $('#ssoProvider').value;
  const section = cfg[provider] || {};
  document.querySelectorAll('#ssoFields [data-sso-k]').forEach((el) => {
    const key = el.dataset.ssoK;
    if (el.type === 'checkbox') section[key] = el.checked;
    else section[key] = el.value.trim();
  });
  return {
    enabled: $('#ssoEnabled').checked,
    provider,
    autoCreate: $('#ssoAutoCreate').checked,
    baseUrl: $('#ssoBaseUrl').value.trim(),
    adminUsernames: $('#ssoAdminUsernames').value.split(',').map((s) => s.trim()).filter(Boolean),
    [provider]: section,
  };
}

function renderSsoFieldsHelp() { /* placeholder for future validation */ }

async function saveSsoConfig() {
  try {
    const data = await api('/api/auth/sso-config', { method: 'PUT', body: { config: collectSsoConfig() } });
    state.ssoConfig = data.config;
    toast(t('sso.saved'), 'ok');
    await refreshSsoStatus();
    renderSsoFields();
  } catch (err) {
    toast(t('sso.saveFailed', { msg: err.message }), 'err');
  }
}

async function refreshSsoStatus() {
  state.ssoStatus = await api('/api/auth/sso-status');
  renderSsoStatus();
}

async function testSso() {
  const btn = $('#ssoTest');
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span><span>' + t('sso.testing') + '</span>';
  try {
    const r = await api('/api/auth/sso-config/test', { method: 'POST' });
    toast(t('sso.testOk'), 'ok');
    $('#ssoMsg').textContent = r.startUrl || '';
    $('#ssoMsg').className = 'editor-status ok';
  } catch (err) {
    $('#ssoMsg').textContent = t('sso.testFailed', { msg: err.message });
    $('#ssoMsg').className = 'editor-status err';
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
}

async function loadSsoMetadata() {
  const url = $('#ssoMetadataUrl').value.trim();
  if (!url) return;
  try {
    const r = await api('/api/auth/sso-config/load-metadata', { method: 'POST', body: { metadataUrl: url } });
    if (!r.ok) throw new Error(r.error);
    const section = $('#ssoFields');
    const set = (k, v) => { const el = section.querySelector('[data-sso-k="' + k + '"]'); if (el && el.type !== 'checkbox') el.value = v || ''; };
    set('idpEntityId', r.idpEntityId);
    set('ssoUrl', r.ssoUrl);
    set('certificate', r.certificate);
    $('#ssoMsg').textContent = t('sso.metaLoaded') + ' (' + (r.ssoUrl || '') + ')';
    $('#ssoMsg').className = 'editor-status ok';
  } catch (err) {
    $('#ssoMsg').textContent = t('sso.metaFailed', { msg: err.message });
    $('#ssoMsg').className = 'editor-status err';
  }
}

/* ============================================================
   i18n application
   ============================================================ */
function activeTab() {
  const el = document.querySelector('.nav-item.active');
  return el && el.dataset.tab ? el.dataset.tab : 'files';
}

function applyStaticI18n() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}

function setPageTitle(tab) {
  const el = $('#pageTitle');
  if (el) el.textContent = t(PAGES[tab] || 'page.files');
  document.title = 'AI-Doc — ' + t(PAGES[tab] || 'page.files');
}

function applyI18nAll() {
  applyStaticI18n();
  setPageTitle(activeTab());
  renderMeta();
  renderFiles();
  renderStyleOptions();
  renderStyleTemplates();
  renderTemplateList();
  updateStyleCurrent();
  renderUsers();
  renderUserChip();
  renderSsoStatus();
  if (state.preview && $('#modal').classList.contains('hidden') === false) {
    updatePreviewMeta();
  }
}

/* ============================================================
   Tabs / navigation
   ============================================================ */
function switchTab(tab) {
  if ((tab === 'users' || tab === 'sso' || tab === 'audit') && !isAdminUser()) tab = 'files';
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const item = document.querySelector('.nav-item[data-tab="' + tab + '"]');
  if (item) item.classList.add('active');
  const view = $('#view-' + tab);
  if (view) view.classList.add('active');
  setPageTitle(tab);
  if (tab === 'files') refreshFiles();
  if (tab === 'templates') { refreshTemplates(); loadStyleOptions(); }
  if (tab === 'styles') refreshStyleTemplates();
  if (tab === 'users') refreshUsers();
  if (tab === 'sso') { refreshSsoStatus(); loadSsoConfig(); }
  if (tab === 'audit') refreshAudit();
}

/* ============================================================
   Meta
   ============================================================ */
function renderMeta() {
  if (!state.meta) return;
  const modeKey = state.meta.storageMode === 's3' ? 'storage.s3'
    : state.meta.storageMode === 'local' ? 'storage.local' : 'storage.unknown';
  $('#metaStorage').textContent = t(modeKey);
  const fmts = (state.meta.formats || []).map((f) => f.format.toUpperCase()).join(' / ');
  const el = $('#metaFormats');
  el.textContent = t('meta.supported') + ': ' + fmts;
  el.hidden = false;
}

async function loadMeta() {
  try {
    state.meta = await api('/api/meta');
    renderMeta();
  } catch (err) {
    $('#metaStorage').textContent = t('meta.offline');
    toast(t('meta.connectFail', { msg: err.message }), 'err');
  }
}

/* ============================================================
   Files
   ============================================================ */
async function refreshFiles() {
  try {
    const data = await api(filesQuery());
    state.files = data.items || [];
    state.filesPage.page = data.page || 1;
    state.filesPage.limit = data.limit || 20;
    state.filesPage.total = data.total || 0;
    state.filesPage.pages = data.pages || 1;
    state.filesPage.owners = data.owners || [];
    // The current page may be emptied after a delete / filter change: jump to the last page.
    if (state.files.length === 0 && state.filesPage.page > 1 && state.filesPage.total > 0 && state.filesPage.pages < state.filesPage.page) {
      state.filesPage.page = state.filesPage.pages;
      return refreshFiles();
    }
    renderFiles();
    renderFilePagination();
    renderFileOwners();
  } catch (err) {
    toast(t('files.loadFailed', { msg: err.message }), 'err');
  }
}

function filesQuery() {
  const p = state.filesPage;
  const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
  const q = ($('#fileSearch').value || '').trim();
  const owner = $('#fileOwner') ? $('#fileOwner').value : '';
  if (q) params.set('q', q);
  if (owner) params.set('owner', owner);
  return '/api/files?' + params.toString();
}

function renderFiles() {
  const rows = $('#fileRows');
  const list = state.files;
  $('#fileEmpty').classList.toggle('hidden', list.length > 0);
  const admin = isAdminUser();
  rows.innerHTML = list.map((f) => {
    const encoded = b64urlEncodeUTF8(f.key);
    const owner = f.owner === 'system'
      ? '<span class="badge-owner system">' + escapeHtml(t('files.ownerSystem')) + '</span>'
      : (f.owner === (state.user && state.user.username)
        ? '<span class="badge-owner mine">' + escapeHtml(t('files.ownerMe')) + '</span>'
        : '<span class="badge-owner">' + escapeHtml(f.owner || '') + '</span>');
    const actions = ''
      + '<button class="icon-btn" data-act="preview" data-key="' + encoded + '">' + t('files.action.preview') + '</button>'
      + '<button class="icon-btn" data-act="download" data-key="' + encoded + '">' + t('files.action.download') + '</button>'
      + (admin ? '<button class="icon-btn" data-act="owner" data-key="' + encoded + '" title="' + escapeAttr(t('files.transfer.title')) + '">' + t('files.action.owner') + '</button>' : '')
      + '<button class="icon-btn danger" data-act="delete" data-key="' + encoded + '">' + t('files.action.delete') + '</button>';
    return '<tr>'
      + '<td title="' + escapeAttr(f.key) + '">' + escapeHtml(f.name) + ' ' + owner + '</td>'
      + '<td>' + formatBadge(f.format) + '</td>'
      + '<td>' + fmtBytes(f.size) + '</td>'
      + '<td class="muted">' + fmtTime(f.lastModified) + '</td>'
      + '<td class="td-right">' + actions + '</td></tr>';
  }).join('');
}

function renderFilePagination() {
  const p = state.filesPage;
  const countEl = $('#fileCount');
  const infoEl = $('#filePageInfo');
  const prevEl = $('#filePrev');
  const nextEl = $('#fileNext');
  const footer = $('#filePagination');
  if (!footer) return;
  footer.classList.toggle('hidden', p.total === 0);
  if (countEl) countEl.textContent = t('files.count', { total: p.total });
  if (infoEl) infoEl.textContent = t('files.pageInfo', { page: p.page, pages: p.pages });
  if (prevEl) prevEl.disabled = p.page <= 1;
  if (nextEl) nextEl.disabled = p.page >= p.pages;
}

function renderFileOwners() {
  const sel = $('#fileOwner');
  if (!sel) return;
  const cur = sel.value;
  const owners = state.filesPage.owners || [];
  const opts = ['<option value="">' + escapeHtml(t('files.allOwners')) + '</option>']
    + owners.map((o) => '<option value="' + escapeAttr(o) + '">' + escapeHtml(o === 'system' ? t('files.ownerSystem') : o) + '</option>').join('');
  sel.innerHTML = opts;
  if (cur && owners.some((o) => o === cur)) sel.value = cur;
  else sel.value = '';
}

function gotoFilesPage(page) {
  const p = state.filesPage;
  const target = Math.min(Math.max(1, page), Math.max(1, p.pages));
  if (target === p.page) return;
  p.page = target;
  refreshFiles();
}

let fileSearchTimer = null;
function onFileSearch() {
  clearTimeout(fileSearchTimer);
  fileSearchTimer = setTimeout(() => {
    state.filesPage.page = 1;
    refreshFiles();
  }, 250);
}

function fileClickHandler(e) {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  const key = b64urlDecodeUTF8(btn.dataset.key);
  const file = state.files.find((f) => f.key === key);
  if (!file) return;
  if (btn.dataset.act === 'preview') openPreview(file);
  if (btn.dataset.act === 'download') window.open(file.downloadUrl, '_blank');
  if (btn.dataset.act === 'owner') openTransferModal(file);
  if (btn.dataset.act === 'delete') deleteFile(file);
}

/* ---- transfer file ownership (admin) ---- */
state.transferFile = null;
async function openTransferModal(file) {
  state.transferFile = file;
  if (state.users.length === 0 && isAdminUser()) {
    try { await refreshUsers(); } catch { /* options still work below */ }
  }
  const sel = $('#transferOwner');
  sel.innerHTML = '<option value="">' + escapeHtml(t('files.ownerSelectNone')) + '</option>'
    + '<option value="system">' + escapeHtml(t('files.ownerSystem')) + '</option>'
    + (state.users || []).map((u) => '<option value="' + escapeAttr(u.username) + '">' + escapeHtml(u.username) + '</option>').join('');
  $('#transferOwner').value = '';
  $('#transferOwnerCustom').value = '';
  $('#transferError').classList.add('hidden');
  $('#transferFileLabel').textContent = t('files.transfer.label') + ' — ' + (file.name || '') + ' ('
    + (file.owner === 'system' ? t('files.ownerSystem') : file.owner) + ')';
  $('#transferModal').classList.remove('hidden');
}

function closeTransferModal() {
  state.transferFile = null;
  $('#transferModal').classList.add('hidden');
}

async function confirmTransfer() {
  const file = state.transferFile;
  if (!file) return;
  const selectOwner = $('#transferOwner').value;
  const customOwner = ($('#transferOwnerCustom').value || '').trim();
  const owner = selectOwner === 'system' ? 'system' : (selectOwner || customOwner);
  const err = $('#transferError');
  if (!owner) {
    err.textContent = t('files.transfer.needOwner');
    err.classList.remove('hidden');
    return;
  }
  try {
    await api('/api/files/transfer', { method: 'POST', body: { key: file.key, owner } });
    toast(t('files.transfer.success', { owner: owner === 'system' ? t('files.ownerSystem') : owner }), 'ok');
    closeTransferModal();
    refreshFiles();
  } catch (err2) {
    toast(t('files.transfer.failed', { msg: err2.message }), 'err');
    err.textContent = err2.message;
    err.classList.remove('hidden');
  }
}

/* ============================================================
   Audit log (admin-only)
   ============================================================ */
function auditQuery() {
  const p = state.auditPage;
  const params = new URLSearchParams({ page: String(p.page), limit: String(p.limit) });
  const actor = ($('#auditActor').value || '').trim();
  const action = $('#auditAction') ? $('#auditAction').value : '';
  const q = ($('#auditSearch').value || '').trim();
  if (actor) params.set('actor', actor);
  if (action) params.set('action', action);
  if (q) params.set('q', q);
  return '/api/audit?' + params.toString();
}

async function refreshAudit() {
  try {
    const data = await api(auditQuery());
    state.audit = data.items || [];
    state.auditPage.page = data.page || 1;
    state.auditPage.limit = data.limit || 20;
    state.auditPage.total = data.total || 0;
    state.auditPage.pages = data.pages || 1;
    state.auditPage.actions = data.actions || [];
    if (state.audit.length === 0 && state.auditPage.page > 1 && state.auditPage.total > 0) {
      state.auditPage.page = state.auditPage.pages;
      return refreshAudit();
    }
    renderAudit();
    renderAuditPagination();
    renderAuditActions();
  } catch (err) {
    toast(t('audit.loadFailed', { msg: err.message }), 'err');
  }
}

function auditActionLabel(action) {
  const key = 'audit.act.' + action;
  return t(key) === key ? action : t(key);
}

function renderAudit() {
  const rows = $('#auditRows');
  const list = state.audit;
  $('#auditEmpty').classList.toggle('hidden', list.length > 0);
  rows.innerHTML = list.map((r) => {
    const role = r.role === 'admin'
      ? '<span class="badge-role admin">' + escapeHtml(t('users.role.admin')) + '</span>'
      : (r.role === 'system'
        ? '<span class="badge-owner system">' + escapeHtml(t('audit.roleSystem')) + '</span>'
        : '');
    return '<tr>'
      + '<td class="muted nowrap">' + fmtTime(r.time) + '</td>'
      + '<td>' + escapeHtml(r.actor || '-') + ' ' + role + '</td>'
      + '<td><span class="audit-action">' + escapeHtml(auditActionLabel(r.action)) + '</span></td>'
      + '<td class="muted" style="word-break:break-all">' + escapeHtml(r.target || '-') + '</td>'
      + '<td class="muted" style="word-break:break-all">' + escapeHtml(r.detail || '') + (r.ip ? '<span class="audit-ip">' + escapeHtml(r.ip) + '</span>' : '') + '</td>'
      + '</tr>';
  }).join('');
}

function renderAuditPagination() {
  const p = state.auditPage;
  const footer = $('#auditPagination');
  if (!footer) return;
  footer.classList.toggle('hidden', p.total === 0);
  const countEl = $('#auditCount');
  const infoEl = $('#auditPageInfo');
  const prevEl = $('#auditPrev');
  const nextEl = $('#auditNext');
  if (countEl) countEl.textContent = t('files.count', { total: p.total });
  if (infoEl) infoEl.textContent = t('audit.pageInfo', { page: p.page, pages: p.pages });
  if (prevEl) prevEl.disabled = p.page <= 1;
  if (nextEl) nextEl.disabled = p.page >= p.pages;
}

function renderAuditActions() {
  const sel = $('#auditAction');
  if (!sel) return;
  const cur = sel.value;
  const actions = state.auditPage.actions || [];
  sel.innerHTML = '<option value="">' + escapeHtml(t('audit.allActions')) + '</option>'
    + actions.map((a) => '<option value="' + escapeAttr(a) + '">' + escapeHtml(auditActionLabel(a)) + '</option>').join('');
  if (cur && actions.indexOf(cur) !== -1) sel.value = cur;
  else sel.value = '';
}

function gotoAuditPage(page) {
  const p = state.auditPage;
  const target = Math.min(Math.max(1, page), Math.max(1, p.pages));
  if (target === p.page) return;
  p.page = target;
  refreshAudit();
}

let auditFilterTimer = null;
function onAuditFilter() {
  clearTimeout(auditFilterTimer);
  auditFilterTimer = setTimeout(() => {
    state.auditPage.page = 1;
    refreshAudit();
  }, 250);
}

async function clearAudit() {
  if (!window.confirm(t('audit.clearConfirm'))) return;
  try {
    await api('/api/audit', { method: 'DELETE' });
    toast(t('audit.cleared'), 'ok');
    state.auditPage.page = 1;
    refreshAudit();
  } catch (err) {
    toast(t('audit.clearFailed', { msg: err.message }), 'err');
  }
}

async function deleteFile(file) {
  if (!window.confirm(t('files.deleteConfirm', { name: file.name, key: file.key }))) return;
  try {
    await api('/api/files/' + b64urlEncodeUTF8(file.key), { method: 'DELETE' });
    toast(t('files.deleted', { name: file.name }), 'ok');
    refreshFiles();
  } catch (err) {
    toast(t('files.deleteFailed', { msg: err.message }), 'err');
  }
}

/* ============================================================
   Templates
   ============================================================ */
async function refreshTemplates() {
  try {
    state.templates = await api('/api/templates');
    renderTemplateList();
    if (state.currentTemplateId) {
      const exists = state.templates.some((t) => t.id === state.currentTemplateId);
      if (exists) selectTemplate(state.currentTemplateId);
    }
  } catch (err) {
    toast(t('tpl.loadFailed', { msg: err.message }), 'err');
  }
}

function renderTemplateList() {
  const list = $('#tplList');
  if (!list) return;
  $('#tplEmpty').classList.toggle('hidden', state.templates.length > 0);
  list.innerHTML = state.templates.map((tpl) => {
    let sub = '<span>' + formatBadge(tpl.format) + '</span>';
    if (tpl.description) sub += '<span class="tpl-item-desc">' + escapeHtml(tpl.description) + '</span>';
    return '<li class="tpl-item ' + (tpl.id === state.currentTemplateId ? 'active' : '') + '" data-id="' + escapeAttr(tpl.id) + '">'
      + '<div class="tpl-item-title">' + escapeHtml(tpl.name) + '</div>'
      + '<div class="tpl-item-sub">' + sub + '</div>'
      + '</li>';
  }).join('');
}

function selectTemplate(id) {
  state.currentTemplateId = id;
  const tpl = state.templates.find((t) => t.id === id);
  if (!tpl) return;
  $('#tplName').value = tpl.name;
  $('#tplDesc').value = tpl.description || '';
  $('#tplFormat').value = tpl.format;
  $('#tplInput').value = JSON.stringify(tpl.input, null, 2);
  if (tpl.styleTemplateId) {
    $('#tplStyle').value = tpl.styleTemplateId;
  }
  renderStyleOptions();
  setStatus('');
  clearResult();
  renderTemplateList();
}

function newTemplate() {
  state.currentTemplateId = null;
  const fmt = $('#tplFormat').value;
  $('#tplName').value = '';
  $('#tplDesc').value = '';
  $('#tplInput').value = JSON.stringify(EXAMPLES[fmt], null, 2);
  $('#tplStyle').value = '';
  renderStyleOptions();
  setStatus(t('tpl.newStatus'));
  clearResult();
  renderTemplateList();
}

function currentInput() {
  try {
    return { ok: true, value: JSON.parse($('#tplInput').value) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function setStatus(text, cls = '') {
  const s = $('#tplStatus');
  if (!s) return;
  s.textContent = text;
  s.className = 'editor-status ' + cls;
}

function clearResult() {
  const r = $('#tplResult');
  if (!r) return;
  r.classList.add('hidden');
  r.innerHTML = '';
}

async function saveTemplate() {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus(t('tpl.jsonError', { msg: parsed.error }), 'err'); return; }
  const styleTemplateId = $('#tplStyle').value || undefined;
  const body = {
    name: $('#tplName').value.trim() || t('tpl.namePlaceholder'),
    format: $('#tplFormat').value,
    description: $('#tplDesc').value.trim() || undefined,
    styleTemplateId,
    input: parsed.value,
  };
  try {
    let tpl;
    if (state.currentTemplateId) {
      tpl = await api('/api/templates/' + state.currentTemplateId, { method: 'PUT', body });
    } else {
      tpl = await api('/api/templates', { method: 'POST', body });
    }
    state.currentTemplateId = tpl.id;
    await refreshTemplates();
    setStatus(t('tpl.saved'), 'ok');
    toast(t('tpl.saveToast'), 'ok');
  } catch (err) {
    setStatus(err.message, 'err');
    toast(t('tpl.saveFailed', { msg: err.message }), 'err');
  }
}

async function deleteTemplate() {
  if (!state.currentTemplateId) return;
  if (!window.confirm(t('tpl.deleteConfirm'))) return;
  try {
    await api('/api/templates/' + state.currentTemplateId, { method: 'DELETE' });
    state.currentTemplateId = null;
    $('#tplName').value = '';
    $('#tplDesc').value = '';
    $('#tplInput').value = '';
    setStatus('');
    clearResult();
    await refreshTemplates();
    toast(t('tpl.deleted'), 'ok');
  } catch (err) {
    toast(t('tpl.deleteFailed', { msg: err.message }), 'err');
  }
}

async function generateFromTemplate() {
  const parsed = currentInput();
  if (!parsed.ok) { setStatus(t('tpl.jsonError', { msg: parsed.error }), 'err'); return; }
  const format = $('#tplFormat').value;
  const styleTemplateId = $('#tplStyle').value || undefined;
  const btn = $('#tplGenerate');
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span><span>' + t('tpl.generating') + '</span>';
  try {
    const doc = await api('/api/generate', { method: 'POST', body: { format, input: parsed.value, styleTemplateId } });
    showResult(doc);
    setStatus(t('tpl.genOk'), 'ok');
    refreshFiles();
  } catch (err) {
    showResult({ error: err.message, ok: false });
    setStatus(t('tpl.genFailed'), 'err');
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
}

function showResult(doc) {
  const r = $('#tplResult');
  if (!r) return;
  r.classList.remove('hidden');
  if (doc.error) {
    r.className = 'result err';
    r.innerHTML = '<div class="result-title">' + t('tpl.genTitleErr') + '</div><div>' + escapeHtml(doc.error) + '</div>';
    return;
  }
  r.className = 'result';
  const name = doc.filename || '';
  r.innerHTML = '<div class="result-title">' + t('tpl.genTitleOk', { fmt: doc.format ? ' ' + doc.format.toUpperCase() : '' }) + '</div>'
    + '<div>' + t('tpl.genName', { name, size: fmtBytes(doc.size) }) + '</div>'
    + '<div>' + t('tpl.genLink') + ' <a href="' + escapeAttr(doc.url) + '" target="_blank" rel="noopener">' + escapeHtml(doc.url) + '</a></div>'
    + '<div class="result-links"><a class="btn btn-primary" href="' + escapeAttr(doc.downloadUrl || doc.url) + '" target="_blank" rel="noopener" download>' + t('tpl.genDownload') + '</a></div>';
}

/* ============================================================
   Style templates
   ============================================================ */
async function fetchStyleCatalog() {
  const data = await api('/api/style-templates');
  state.styleTemplates = data.items || [];
  state.styleDefaults = data.defaults || {};
  state.styleSystemDefaults = data.systemDefaults || {};
  state.styleOwnDefaults = data.ownDefaults || {};
  return data;
}

async function refreshStyleTemplates() {
  try {
    await fetchStyleCatalog();
    renderStyleTemplates();
    renderStyleOptions();
    updateStyleCurrent();
  } catch (err) {
    toast(t('styles.loadFailed', { msg: err.message }), 'err');
  }
}

function renderStyleTemplates() {
  const rows = $('#styleRows');
  if (!rows) return;
  const list = state.styleTemplates || [];
  const currentId = $('#tplStyle').value;
  $('#styleEmpty').classList.toggle('hidden', list.length > 0);
  rows.innerHTML = list.map((tpl) => {
    const editing = tpl.id === currentId ? ' <span class="badge-inuse">' + escapeHtml(t('styles.editing')) + '</span>' : '';
    const ownerBadge = tpl.system
      ? ' <span class="badge-owner system">' + escapeHtml(t('styles.ownerSystem')) + '</span>'
      : (tpl.owner === (state.user && state.user.username)
        ? ' <span class="badge-owner mine">' + escapeHtml(t('styles.ownerMine')) + '</span>'
        : ' <span class="badge-owner">' + escapeHtml(tpl.owner || '') + '</span>');
    const effective = (state.styleDefaults || {})[tpl.format] === tpl.id;
    let currentCol = '';
    if (effective) {
      currentCol = '<span class="badge-current">' + escapeHtml(t('styles.current')) + '</span>';
    } else if (tpl.manageable) {
      currentCol = '<button class="icon-btn" data-act="setdefault" data-id="' + escapeAttr(tpl.id) + '" data-format="' + escapeAttr(tpl.format) + '">'
        + (isAdminUser() ? t('styles.setSystemDefault') : t('styles.setMyDefault')) + '</button>';
    } else if (tpl.isSystemDefault) {
      currentCol = '<span class="badge-owner system" title="' + escapeAttr(t('styles.systemDefault')) + '">' + escapeHtml(t('styles.systemDefault')) + '</span>';
    }
    const delBtn = tpl.manageable
      ? '<button class="icon-btn danger" data-act="delete" data-id="' + escapeAttr(tpl.id) + '">' + t('files.action.delete') + '</button>' : '';
    return '<tr>'
      + '<td>' + escapeHtml(tpl.name) + editing + '</td>'
      + '<td>' + formatBadge(tpl.format) + '</td>'
      + '<td>' + currentCol + '</td>'
      + '<td title="' + escapeAttr(tpl.filename) + '">' + escapeHtml(tpl.filename) + '</td>'
      + '<td>' + fmtBytes(tpl.size) + ownerBadge + '</td>'
      + '<td class="td-right">' + delBtn + '</td>'
      + '</tr>';
  }).join('');
}

async function loadStyleOptions() {
  try {
    await fetchStyleCatalog();
  } catch { /* ignore */ }
  renderStyleOptions();
  updateStyleCurrent();
}

function detectStyleFormat(filename) {
  const parts = (filename || '').split('.');
  if (parts.length < 2) return null;
  const ext = parts.pop().toLowerCase();
  return ext === 'pptx' || ext === 'docx' || ext === 'xlsx' ? ext : null;
}

function renderStyleOptions() {
  const sel = $('#tplStyle');
  if (!sel) return;
  const fmt = $('#tplFormat').value;
  const list = (state.styleTemplates || []).filter((tpl) => tpl.format === fmt);
  const cur = sel.value;
  const defaults = state.styleDefaults || {};
  sel.innerHTML = '<option value="">' + escapeHtml(t('tpl.styleNone')) + '</option>'
    + list.map((tpl) => {
      let label = tpl.name;
      if (tpl.system) label += ' · ' + t('styles.ownerSystem');
      if (tpl.filename !== tpl.name) label += ' — ' + tpl.filename;
      if (defaults[fmt] === tpl.id) label += ' (' + escapeHtml(t('styles.current').replace(/^←\s*/, '')) + ')';
      return '<option value="' + escapeAttr(tpl.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');
  if (list.some((tpl) => tpl.id === cur)) sel.value = cur;
  else if (sel.value !== '') sel.value = '';
  updateStyleCurrent();
}

function updateStyleCurrent() {
  const el = $('#tplStyleCurrent');
  if (!el) return;
  const sel = $('#tplStyle');
  const fmt = $('#tplFormat').value;
  const opt = sel.options[sel.selectedIndex];
  if (sel.value && opt) {
    el.textContent = t('tpl.styleApplied', { name: opt.text });
    el.className = 'tpl-style-current';
    return;
  }
  const defaults = state.styleDefaults || {};
  const defId = defaults[fmt];
  if (defId) {
    const def = (state.styleTemplates || []).find((tpl) => tpl.id === defId);
    if (def) {
      el.textContent = t('tpl.styleFallback', { name: def.name });
      el.className = 'tpl-style-current fallback';
      return;
    }
  }
  el.textContent = t('tpl.styleUnset');
  el.className = 'tpl-style-current none';
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      resolve((result.split(',')[1] || ''));
    };
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

function setStyleStatus(text, cls = '') {
  const s = $('#styleStatus');
  if (!s) return;
  s.textContent = text;
  s.className = 'editor-status ' + cls;
}

function updateStyleDetect(fmt) {
  const el = $('#styleDetect');
  if (!el) return;
  if (!fmt) { el.classList.add('hidden'); el.textContent = ''; return; }
  el.textContent = t('styles.detect', { fmt: formatLabel(fmt) });
  el.classList.remove('hidden');
}

async function uploadStyleTemplate() {
  const fileInput = $('#styleFile');
  const file = fileInput.files && fileInput.files[0];
  if (!file) { setStyleStatus(t('styles.selectFile'), 'err'); return; }
  const fmt = detectStyleFormat(file.name);
  if (!fmt) {
    setStyleStatus(t('styles.unsupportedType', { name: file.name }), 'err');
    return;
  }
  const data = await fileToBase64(file);
  const body = {
    name: $('#styleName').value.trim() || file.name,
    format: fmt,
    filename: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
  };
  if (isAdminUser() && $('#styleAsSystem').checked) body.owner = 'system';
  try {
    await api('/api/style-templates', { method: 'POST', body });
    setStyleStatus(t('styles.uploadOk'), 'ok');
    $('#styleName').value = '';
    fileInput.value = '';
    $('#styleFileName').textContent = t('styles.chooseFile');
    $('#styleFileName').classList.remove('has');
    updateStyleDetect(null);
    await refreshStyleTemplates();
    renderStyleOptions();
  } catch (err) {
    setStyleStatus(t('styles.uploadFailed', { msg: err.message }), 'err');
  }
}

async function styleTableClick(e) {
  const btn = e.target.closest('.icon-btn');
  if (!btn) return;
  if (btn.dataset.act === 'delete') {
    if (!window.confirm(t('styles.deleteConfirm'))) return;
    try {
      await api('/api/style-templates/' + btn.dataset.id, { method: 'DELETE' });
      toast(t('styles.deleteOk'), 'ok');
      await refreshStyleTemplates();
      renderStyleOptions();
    } catch (err) {
      toast(t('styles.deleteFailed', { msg: err.message }), 'err');
    }
    return;
  }
  if (btn.dataset.act === 'setdefault') {
    try {
      await api('/api/style-templates/defaults', { method: 'PUT', body: { format: btn.dataset.format, id: btn.dataset.id } });
      toast(t('styles.setDefaultOk'), 'ok');
      await refreshStyleTemplates();
      renderStyleOptions();
    } catch (err) {
      toast(t('styles.setDefaultFailed', { msg: err.message }), 'err');
    }
  }
}

/* ============================================================
   Preview modal — in-browser document rendering
   ============================================================ */
function setPreviewStatus(type, text) {
  $('#previewLoading').classList.toggle('hidden', type !== 'loading');
  $('#previewError').classList.toggle('hidden', type !== 'error');
  $('#previewWrap').classList.toggle('hidden', type !== 'ready');
  if (text !== undefined && text !== null) $('#previewErrorText').textContent = text;
}

function setPreviewInfoVisible(visible) {
  $('#modalInfo').classList.toggle('hidden', !visible);
  $('#previewLoading').classList.add('hidden');
  $('#previewError').classList.add('hidden');
  $('#previewWrap').classList.add('hidden');
}

function updatePreviewMeta() {
  const p = state.preview;
  if (!p) return;
  $('#modalMeta').textContent = (p.file.format || 'unknown').toUpperCase()
    + ' · ' + fmtBytes(p.file.size)
    + ' · ' + fmtTime(p.file.lastModified);
}

function buildPreviewActions(file, onRerender) {
  const actions = $('#modalAction');
  actions.innerHTML = ''
    + '<button class="btn btn-primary" data-act="download">' + t('preview.download') + '</button>'
    + '<button class="btn btn-ghost" data-act="open-url">' + t('preview.openUrl') + '</button>'
    + '<button class="btn btn-ghost" data-act="rerender">' + t('preview.rerender') + '</button>';
  actions.querySelector('[data-act="download"]').onclick = () => window.open(file.downloadUrl, '_blank');
  actions.querySelector('[data-act="open-url"]').onclick = () => window.open(file.url, '_blank');
  actions.querySelector('[data-act="rerender"]').onclick = () => { if (onRerender) onRerender(); };
}

function buildPreviewInfo(file, extra) {
  const info = $('#modalInfo');
  let rows = ''
    + '<dt>' + t('preview.info.name') + '</dt><dd>' + escapeHtml(file.name) + '</dd>'
    + '<dt>' + t('preview.info.format') + '</dt><dd>' + escapeHtml((file.format || 'unknown').toUpperCase()) + '</dd>'
    + '<dt>' + t('preview.info.size') + '</dt><dd>' + fmtBytes(file.size) + '</dd>'
    + '<dt>' + t('preview.info.time') + '</dt><dd>' + fmtTime(file.lastModified) + '</dd>'
    + '<dt>' + t('preview.info.key') + '</dt><dd>' + escapeHtml(file.key) + '</dd>'
    + '<dt>' + t('preview.info.url') + '</dt><dd><a href="' + escapeAttr(file.url) + '" target="_blank" rel="noopener">' + escapeHtml(file.url) + '</a></dd>';
  if (extra) rows += extra;
  info.innerHTML = '<dl class="info-grid">' + rows + '</dl>';
}

function renderPreview(file, buf, opts) {
  const content = $('#previewContent');
  content.innerHTML = '';
  const footer = $('#previewState');
  let metaHtml = '';

  if (!window.AIDocViewers || !window.AIDocViewers['render' + file.format.slice(0, 1).toUpperCase() + file.format.slice(1)]) {
    if (file.format === 'pdf') {
      // native fallback for PDF
      const iframe = document.createElement('iframe');
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.border = 'none';
      iframe.src = file.previewUrl;
      content.appendChild(iframe);
      setPreviewStatus('ready');
      return;
    }
    throw new Error(t('preview.notBundle'));
  }

  const V = window.AIDocViewers;
  const formatName = 'render' + file.format.slice(0, 1).toUpperCase() + file.format.slice(1);

  if (file.format === 'docx') {
    content.classList.add('docx-host');
    return V.renderDocx(buf, content, {}).then(() => {
      setPreviewStatus('ready');
      footer.textContent = '';
    });
  }

  if (file.format === 'pdf') {
    return V.renderPdf(buf, content, {}).then((r) => {
      setPreviewStatus('ready');
      footer.textContent = t('preview.pages', { n: r.numPages });
    });
  }

  if (file.format === 'xlsx') {
    return V.renderXlsx(buf, content, { sheet: opts && opts.sheet }).then((r) => {
      setPreviewStatus('ready');
      metaHtml = '<div class="sheet-tabs">'
        + r.sheets.map((s) => '<button class="sheet-tab ' + (s === r.active ? 'active' : '') + '" data-sheet="' + escapeAttr(s) + '">' + escapeHtml(s) + '</button>').join('')
        + '</div>';
      footer.innerHTML = metaHtml;
      footer.querySelectorAll('.sheet-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          const sheetName = btn.dataset.sheet;
          content.innerHTML = '';
          V.renderXlsx(buf, content, { sheet: sheetName }).then((r2) => {
            footer.querySelectorAll('.sheet-tab').forEach((b) => b.classList.toggle('active', b === btn));
          }).catch((err) => setPreviewStatus('error', t('preview.renderFail', { msg: err.message })));
        });
      });
    });
  }

  if (file.format === 'pptx') {
    return V.renderPptx(buf, content, {}).then((r) => {
      setPreviewStatus('ready');
      footer.textContent = '';
    });
  }

  return Promise.reject(new Error(t('preview.unsupported')));
}

function openPreview(file) {
  state.preview = { file };
  $('#modalTitle').textContent = file.name || '预览';
  updatePreviewMeta();
  buildPreviewActions(file, () => {
    const buf = state.preview && state.preview.buf;
    const sheet = $('#previewState') && $('#previewState').querySelector('.sheet-tab.active');
    const sheetName = sheet && sheet.dataset.sheet;
    if (buf) renderPreview(file, buf, { sheet: sheetName });
  });
  $('#modal').classList.remove('hidden');
  setPreviewStatus('loading');

  const isPreviewable = ['docx', 'pdf', 'xlsx', 'pptx'].indexOf(file.format) > -1;
  if (!isPreviewable) {
    setPreviewInfoVisible(true);
    $('#previewContent').innerHTML = '';
    buildPreviewInfo(file);
    return;
  }

  fetch(file.previewUrl)
    .then((res) => {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.arrayBuffer();
    })
    .then((buf) => {
      state.preview.buf = buf;
      return renderPreview(file, buf, {});
    })
    .catch((err) => {
      setPreviewStatus('error', t('preview.fetchFail', { msg: err.message }));
    });
}

function closePreview() {
  const content = $('#previewContent');
  content.innerHTML = '';
  $('#modal').classList.add('hidden');
  state.preview = null;
}

/* ============================================================
   Utils
   ============================================================ */
function b64urlEncodeUTF8(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecodeUTF8(s) {
  let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) {
  return escapeHtml(s);
}

/* ============================================================
   Init
   ============================================================ */
function bindEvents() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
  $('#sidebarToggle').addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
    if (window.innerWidth <= 780) $('#sidebar').classList.toggle('open');
  });

  $('#themeSelect').addEventListener('change', (e) => {
    setThemePref(e.target.value);
    applyTheme();
  });
  $('#langSelect').addEventListener('change', (e) => {
    lang = e.target.value;
    localStorage.setItem('aidoc-lang', lang);
    applyI18nAll();
  });

  $('#fileRefresh').addEventListener('click', refreshFiles);
  $('#fileSearch').addEventListener('input', onFileSearch);
  $('#fileOwner').addEventListener('change', () => { state.filesPage.page = 1; refreshFiles(); });
  $('#filePrev').addEventListener('click', () => gotoFilesPage(state.filesPage.page - 1));
  $('#fileNext').addEventListener('click', () => gotoFilesPage(state.filesPage.page + 1));
  $('#fileTable').addEventListener('click', fileClickHandler);
  $('#transferClose').addEventListener('click', closeTransferModal);
  $('#transferSave').addEventListener('click', confirmTransfer);
  $('#transferModal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeTransferModal();
  });
  $('#auditRefresh').addEventListener('click', refreshAudit);
  $('#auditSearch').addEventListener('input', onAuditFilter);
  $('#auditActor').addEventListener('input', onAuditFilter);
  $('#auditAction').addEventListener('change', () => { state.auditPage.page = 1; refreshAudit(); });
  $('#auditPrev').addEventListener('click', () => gotoAuditPage(state.auditPage.page - 1));
  $('#auditNext').addEventListener('click', () => gotoAuditPage(state.auditPage.page + 1));
  $('#auditClear').addEventListener('click', clearAudit);

  $('#tplNew').addEventListener('click', newTemplate);
  $('#tplList').addEventListener('click', (e) => {
    const item = e.target.closest('.tpl-item');
    if (item) selectTemplate(item.dataset.id);
  });
  $('#tplSave').addEventListener('click', saveTemplate);
  $('#tplDelete').addEventListener('click', deleteTemplate);
  $('#tplGenerate').addEventListener('click', generateFromTemplate);
  $('#tplValidate').addEventListener('click', () => {
    const parsed = currentInput();
    if (!parsed.ok) { setStatus(t('tpl.jsonError', { msg: parsed.error }), 'err'); return; }
    setStatus(t('tpl.jsonOk'), 'ok');
  });
  $('#tplFormatJson').addEventListener('click', () => {
    const parsed = currentInput();
    if (!parsed.ok) { setStatus(t('tpl.jsonError', { msg: parsed.error }), 'err'); return; }
    $('#tplInput').value = JSON.stringify(parsed.value, null, 2);
    setStatus(t('tpl.formatted'), 'ok');
  });
  $('#tplExample').addEventListener('click', () => {
    $('#tplInput').value = JSON.stringify(EXAMPLES[$('#tplFormat').value], null, 2);
    setStatus(t('tpl.exampleLoaded'));
  });
  $('#tplFormat').addEventListener('change', () => {
    if (!state.currentTemplateId && !$('#tplName').value.trim()) {
      $('#tplInput').value = JSON.stringify(EXAMPLES[$('#tplFormat').value], null, 2);
    }
    renderStyleOptions();
  });
  $('#tplStyle').addEventListener('change', updateStyleCurrent);

  $('#styleRefresh').addEventListener('click', refreshStyleTemplates);
  $('#styleUpload').addEventListener('click', uploadStyleTemplate);
  $('#styleTable').addEventListener('click', styleTableClick);  $('#styleFile').addEventListener('change', (e) => {
    const hint = $('#styleFileName');
    const file = e.target.files && e.target.files[0];
    if (file) {
      hint.textContent = file.name;
      hint.classList.add('has');
      updateStyleDetect(detectStyleFormat(file.name));
    } else {
      hint.textContent = t('styles.chooseFile');
      hint.classList.remove('has');
      updateStyleDetect(null);
    }
  });

  $('#modalClose').addEventListener('click', closePreview);
  $('#modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePreview();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').classList.contains('hidden')) closePreview();
  });
  $('#previewRetry').addEventListener('click', () => {
    const file = state.preview && state.preview.file;
    if (file) openPreview(file);
  });

  // ---- auth / account ----
  $('#loginForm').addEventListener('submit', tryLogin);
  $('#loginSso').addEventListener('click', ssoLogin);
  $('#logoutBtn').addEventListener('click', doLogout);
  $('#pwdBtn').addEventListener('click', openPwdModal);
  $('#pwdClose').addEventListener('click', closePwdModal);
  $('#pwdModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closePwdModal(); });
  $('#pwdSave').addEventListener('click', savePassword);
  $('#pwdNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') savePassword(); });

  // ---- users (admin) ----
  $('#userNew').addEventListener('click', openNewUserModal);
  $('#userRefresh').addEventListener('click', refreshUsers);
  $('#userTable').addEventListener('click', userTableClick);

  // ---- SSO config (admin) ----
  $('#ssoSave').addEventListener('click', saveSsoConfig);
  $('#ssoTest').addEventListener('click', testSso);
  $('#ssoLoadMetadata').addEventListener('click', loadSsoMetadata);
  $('#ssoProvider').addEventListener('change', renderSsoProviderFields);
}

(async () => {
  applyTheme();
  applyStaticI18n();
  const langEl = $('#langSelect');
  if (langEl) langEl.value = lang;
  bindEvents();
  loadMeta();
  try {
    state.ssoStatus = await api('/api/auth/sso-status');
  } catch {
    state.ssoStatus = null;
  }
  try {
    const st = await api('/api/auth/status');
    if (st && st.user) {
      enterApp(st.user);
      switchTab('files');
      return;
    }
  } catch { /* not authenticated */ }
  const params = new URLSearchParams(window.location.search);
  const ssoErr = params.get('ssoerror');
  if (ssoErr) {
    const err = $('#loginError');
    if (err) {
      err.textContent = t('login.ssoError', { msg: ssoErr });
      err.classList.remove('hidden');
    }
  }
  // Auto-sign-in: when SSO is enabled and configured, jump straight to the
  // provider instead of waiting for a manual click. `?local=1` or a fresh
  // `ssoerror` bypasses this to avoid redirect loops / allow local fallback.
  const sso = state.ssoStatus;
  const autoSso = !!(sso && sso.enabled && sso.configured && sso.provider && sso.provider !== 'none')
    && !ssoErr
    && params.get('local') !== '1';
  if (autoSso) {
    const relay = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.replace('/login/sso?relay=' + relay);
    return;
  }
  showLoginScreen();
})();
